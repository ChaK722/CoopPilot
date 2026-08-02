import { describe, expect, it, vi } from "vitest";
import { createProfileService } from "@/features/profile/profile-service";

function mockQueryResult(result: unknown) {
  return { data: result, error: null };
}

function mockError(message: string) {
  return { data: null, error: { message } };
}

interface BuilderCall {
  method: string;
  args: unknown[];
}

/**
 * Builds a supabase-like chainable mock. Terminal methods (maybeSingle,
 * single, rpc, raw promises) return configured results in call order.
 */
function mockSupabase(results: Record<string, unknown[]>) {
  const calls: BuilderCall[] = [];

  const makeChain = () => {
    const thenable = {
      then(resolve: (value: unknown) => void) {
        resolve(results.chainResult?.shift() ?? { data: [], error: null });
      },
    };
    return new Proxy(thenable, {
      get(target, prop: string) {
        if (prop === "then") return target.then.bind(target);
        if (["maybeSingle", "single"].includes(prop)) {
          return () => {
            calls.push({ method: prop, args: [] });
            return (results[prop] ?? []).shift() ?? mockQueryResult(null);
          };
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return makeChain();
        };
      },
    });
  };

  const from = vi.fn(() => makeChain());
  const rpc = vi.fn((name: string, params: unknown) => {
    calls.push({ method: "rpc", args: [name, params] });
    return (results.rpc ?? []).shift() ?? mockQueryResult(null);
  });

  return {
    client: { from, rpc } as unknown as Parameters<typeof createProfileService>[0],
    calls,
    mocks: { from, rpc },
  };
}

const VALID_INPUT = {
  preferred_name: "Alex",
  phone: "",
  location: "Toronto",
  linkedin_url: "",
  github_url: "https://github.com/alex",
  website_url: "",
  preferred_locations: ["Toronto"],
  remote_preference: "Hybrid",
  preferred_work_term_lengths: ["4 months"],
  target_roles: ["Intern"],
  available_start_date: "2026-09-01",
};

describe("createProfileService", () => {
  it("scopes every education mutation to the current user", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockQueryResult({ id: "edu-1" })] });
    const service = createProfileService(supabase.client);

    await service.updateEducation("user-a", "edu-1", {
      school: "Waterloo",
      degree: "BSc",
      program: "CS",
      start_date: null,
      expected_graduation_date: null,
      relevant_coursework: [],
    });

    const updateCall = supabase.calls.find((call) => call.method === "update");
    const eqCalls = supabase.calls.filter((call) => call.method === "eq");
    expect(eqCalls.some((call) => call.args[0] === "user_id" && call.args[1] === "user-a")).toBe(
      true,
    );
    expect(updateCall).toBeDefined();
  });

  it("treats another user's education as not found", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockQueryResult(null)] });
    const service = createProfileService(supabase.client);

    await expect(
      service.updateEducation("user-b", "edu-of-a", {
        school: "Waterloo",
        degree: "BSc",
        program: "CS",
        start_date: null,
        expected_graduation_date: null,
        relevant_coursework: [],
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("deletes only records owned by the user", async () => {
    const supabase = mockSupabase({ chainResult: [mockQueryResult([{ id: "edu-1" }])] });
    const service = createProfileService(supabase.client);

    await service.deleteEducation("user-a", "edu-1");

    const deleteCall = supabase.calls.find((call) => call.method === "delete");
    const eqArgs = supabase.calls.filter((call) => call.method === "eq").map((call) => call.args);
    expect(deleteCall).toBeDefined();
    expect(eqArgs).toContainEqual(["id", "edu-1"]);
    expect(eqArgs).toContainEqual(["user_id", "user-a"]);
  });

  it("treats deleting a missing or foreign record as not found", async () => {
    const supabase = mockSupabase({ chainResult: [mockQueryResult([])] });
    const service = createProfileService(supabase.client);

    await expect(service.deleteEducation("user-b", "edu-of-a")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("moves records through the transactional swap RPC", async () => {
    const supabase = mockSupabase({
      chainResult: [
        mockQueryResult([
          { id: "edu-2", sort_order: 0 },
          { id: "edu-1", sort_order: 1 },
        ]),
      ],
      rpc: [mockQueryResult(true)],
    });
    const service = createProfileService(supabase.client);

    await service.moveEducation("user-a", "edu-1", "up");

    const rpcCall = supabase.calls.find((call) => call.method === "rpc");
    expect(rpcCall?.args[0]).toBe("swap_sort_order");
    expect(rpcCall?.args[1]).toEqual(
      expect.objectContaining({ p_table: "educations", p_user_id: "user-a" }),
    );
  });

  it("treats a failed swap on a foreign record as not found", async () => {
    const supabase = mockSupabase({
      chainResult: [
        mockQueryResult([
          { id: "edu-2", sort_order: 0 },
          { id: "edu-1", sort_order: 1 },
        ]),
      ],
      rpc: [mockQueryResult(false)],
    });
    const service = createProfileService(supabase.client);

    await expect(service.moveEducation("user-b", "edu-of-a", "up")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("deduplicates skills by normalized name per category before saving", async () => {
    const supabase = mockSupabase({});
    const service = createProfileService(supabase.client);

    await service.replaceSkills("user-a", [
      { category: "tools", name: "Git" },
      { category: "tools", name: "  GIT " },
      { category: "tools", name: "Docker" },
      { category: "frameworks", name: "Git" },
    ]);

    const rpcCall = supabase.calls.find((call) => call.method === "rpc");
    expect(rpcCall).toBeDefined();
    const rows = (rpcCall?.args[1] as { p_skills: unknown[] }).p_skills;
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "tools", name: "Git", normalized_name: "git" }),
        expect.objectContaining({ category: "tools", name: "Docker", normalized_name: "docker" }),
        expect.objectContaining({ category: "frameworks", name: "Git", normalized_name: "git" }),
      ]),
    );
  });

  it("completes onboarding by setting onboarding_completed_at", async () => {
    const supabase = mockSupabase({});
    const service = createProfileService(supabase.client);

    await service.completeOnboarding("user-a", VALID_INPUT);

    const updateCall = supabase.calls.find((call) => call.method === "update");
    const payload = updateCall?.args[0] as Record<string, unknown>;
    expect(payload.onboarding_completed_at).toEqual(expect.any(String));
    expect(payload.preferred_name).toBe("Alex");
  });

  it("does not set onboarding_completed_at for a regular profile save", async () => {
    const supabase = mockSupabase({});
    const service = createProfileService(supabase.client);

    await service.updateBasicInfo("user-a", VALID_INPUT);

    const updateCall = supabase.calls.find((call) => call.method === "update");
    const payload = updateCall?.args[0] as Record<string, unknown>;
    expect(payload.onboarding_completed_at).toBeUndefined();
  });

  it("surfaces database failures as safe AppErrors", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockError("connection refused")] });
    const service = createProfileService(supabase.client);

    await expect(
      service.updateEducation("user-a", "edu-1", {
        school: "Waterloo",
        degree: "BSc",
        program: "CS",
        start_date: null,
        expected_graduation_date: null,
        relevant_coursework: [],
      }),
    ).rejects.toMatchObject({ kind: "database_unavailable" });
  });

  it("returns the full profile bundle", async () => {
    const supabase = mockSupabase({
      maybeSingle: [mockQueryResult({ id: "profile-1" })],
    });
    const service = createProfileService(supabase.client);

    const bundle = await service.getProfileBundle("user-a");
    expect(bundle.profile).toEqual({ id: "profile-1" });
    expect(bundle.educations).toEqual([]);
    expect(bundle.skills).toEqual([]);
    expect(bundle.experiences).toEqual([]);
    expect(bundle.projects).toEqual([]);
    expect(supabase.mocks.from).toHaveBeenCalledWith("user_profiles");
  });
});
