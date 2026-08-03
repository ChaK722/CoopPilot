import { describe, expect, it, vi } from "vitest";
import { createApplicationService } from "@/features/applications/application-service";

function mockQueryResult(result: unknown) {
  return { data: result, error: null };
}

interface BuilderCall {
  method: string;
  args: unknown[];
}

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
    client: { from, rpc } as unknown as Parameters<typeof createApplicationService>[0],
    calls,
    mocks: { from, rpc },
  };
}

const VALID_INPUT = {
  company: "Acme",
  job_title: "Intern",
  location: null,
  country: null,
  work_arrangement: null,
  employment_type: null,
  work_term_duration: null,
  deadline: null,
  salary_text: null,
  education_requirements: [],
  years_of_experience: null,
  posting_url: null,
  original_description: "Job text",
  responsibilities: [],
  qualifications: [],
  creation_key: "11111111-1111-4111-8111-111111111111",
  skills: [{ requirement_type: "required" as const, name: "TypeScript" }],
};

describe("createApplicationService", () => {
  it("loads board rows and latest match scores in exactly two bounded reads", async () => {
    const supabase = mockSupabase({
      chainResult: [
        mockQueryResult([
          {
            id: "app-1",
            company: "Alpha",
            job_title: "Intern",
            status: "saved",
            updated_at: "2026-08-02T00:00:00.000Z",
            archived_at: null,
          },
          {
            id: "app-2",
            company: "Beta",
            job_title: "Co-op",
            status: "applied",
            updated_at: "2026-08-01T00:00:00.000Z",
            archived_at: null,
          },
        ]),
      ],
      rpc: [
        mockQueryResult([
          { application_id: "app-1", overall_score: 78 },
          { application_id: "app-3", overall_score: 99 },
        ]),
      ],
    });
    const service = createApplicationService(supabase.client);

    const rows = await service.listBoardWithScores("user-a");

    expect(rows).toHaveLength(2);
    expect(rows[0].latest_match_score).toBe(78);
    expect(rows[1].latest_match_score).toBeNull();
    // One applications query plus one batch RPC: no per-card match queries.
    expect(supabase.mocks.from).toHaveBeenCalledTimes(1);
    expect(supabase.mocks.rpc).toHaveBeenCalledWith("get_board_match_scores", {
      p_user_id: "user-a",
    });
    expect(supabase.calls.some((call) => call.method === "maybeSingle")).toBe(false);
  });

  it("routes search through the parameterized RPC instead of .or() strings", async () => {
    const supabase = mockSupabase({
      rpc: [mockQueryResult([{ application_id: "app-1" }])],
      chainResult: [mockQueryResult([{ id: "app-1", company: "Acme" }])],
    });
    const service = createApplicationService(supabase.client);

    const rows = await service.listApplications("user-a", {
      search: "Acme, ( ) ' \" % _ \\",
    });

    expect(supabase.mocks.rpc).toHaveBeenCalledWith("search_application_ids", {
      p_user_id: "user-a",
      p_term: "Acme, ( ) ' \" % _ \\",
      p_requirement_type: null,
    });
    expect(rows).toHaveLength(1);
    expect(supabase.calls.some((call) => call.method === "or")).toBe(false);
  });

  it("routes required-skill filtering through the parameterized RPC", async () => {
    const supabase = mockSupabase({
      rpc: [mockQueryResult([{ application_id: "app-2" }])],
      chainResult: [mockQueryResult([{ id: "app-2", company: "Beta" }])],
    });
    const service = createApplicationService(supabase.client);

    await service.listApplications("user-a", { requiredSkill: "TypeScript" });

    expect(supabase.mocks.rpc).toHaveBeenCalledWith("search_application_ids", {
      p_user_id: "user-a",
      p_term: "TypeScript",
      p_requirement_type: "required",
    });
    expect(supabase.calls.some((call) => call.method === "or")).toBe(false);
  });

  it("creates an application through the transactional RPC with normalized skills", async () => {
    const supabase = mockSupabase({ rpc: [mockQueryResult("app-1")] });
    const service = createApplicationService(supabase.client);

    const id = await service.createApplication("user-a", VALID_INPUT);

    expect(id).toBe("app-1");
    const rpcCall = supabase.calls.find((call) => call.method === "rpc");
    expect(rpcCall?.args[0]).toBe("create_application");
    const params = rpcCall?.args[1] as Record<string, unknown>;
    expect(params.p_user_id).toBe("user-a");
    expect(params.p_skills).toEqual([
      {
        requirement_type: "required",
        name: "TypeScript",
        normalized_name: "typescript",
        sort_order: 0,
      },
    ]);
  });

  it("scopes getApplication to the current user", async () => {
    const supabase = mockSupabase({
      maybeSingle: [mockQueryResult({ id: "app-1" })],
    });
    const service = createApplicationService(supabase.client);

    const bundle = await service.getApplication("user-a", "app-1");
    expect(bundle.application.id).toBe("app-1");
    expect(bundle.skills).toEqual([]);
    expect(bundle.events).toEqual([]);
    expect(bundle.interviews).toEqual([]);
  });

  it("throws not found when the application does not belong to the user", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockQueryResult(null)] });
    const service = createApplicationService(supabase.client);

    await expect(service.getApplication("user-b", "app-of-a")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("throws not found when deleting a missing or foreign application", async () => {
    const supabase = mockSupabase({ chainResult: [mockQueryResult([])] });
    const service = createApplicationService(supabase.client);

    await expect(service.deleteApplication("user-b", "app-of-a")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("duplicates through the RPC and treats null as not found", async () => {
    const ok = mockSupabase({ rpc: [mockQueryResult("app-2")] });
    expect(await createApplicationService(ok.client).duplicateApplication("user-a", "app-1")).toBe(
      "app-2",
    );

    const missing = mockSupabase({ rpc: [mockQueryResult(null)] });
    await expect(
      createApplicationService(missing.client).duplicateApplication("user-a", "app-1"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("scopes notes saves to the owning user", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockQueryResult({ id: "app-1" })] });
    const service = createApplicationService(supabase.client);

    await service.saveNotes("user-a", "app-1", "hello");

    const updateCall = supabase.calls.find((call) => call.method === "update");
    expect((updateCall?.args[0] as { notes: string }).notes).toBe("hello");
    expect(
      supabase.calls.filter((call) => call.method === "eq" && call.args[0] === "user_id"),
    ).toHaveLength(1);
  });

  it("throws not found when saving notes on a foreign application", async () => {
    const supabase = mockSupabase({ maybeSingle: [mockQueryResult(null)] });
    const service = createApplicationService(supabase.client);

    await expect(service.saveNotes("user-b", "app-of-a", "x")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("updates status through the controlled RPC with the provided date", async () => {
    const supabase = mockSupabase({ rpc: [mockQueryResult("app-1")] });
    const service = createApplicationService(supabase.client);

    await service.updateStatus("user-a", "app-1", "applied", "2026-08-02");

    const rpcCall = supabase.calls.find((call) => call.method === "rpc");
    expect(rpcCall?.args[0]).toBe("update_application_status");
    expect(rpcCall?.args[1]).toEqual(
      expect.objectContaining({
        p_user_id: "user-a",
        p_application_id: "app-1",
        p_to_status: "applied",
        p_date_applied: "2026-08-02",
      }),
    );
  });

  it("treats a null status-update result as not found", async () => {
    const supabase = mockSupabase({ rpc: [mockQueryResult(null)] });
    const service = createApplicationService(supabase.client);

    await expect(service.updateStatus("user-b", "app-of-a", "applied", null)).rejects.toMatchObject(
      { kind: "not_found" },
    );
  });

  it("archives and restores only owned applications", async () => {
    const ok = mockSupabase({ maybeSingle: [mockQueryResult({ id: "app-1" })] });
    await createApplicationService(ok.client).archiveApplication("user-a", "app-1");
    const archiveUpdate = ok.calls.find((call) => call.method === "update");
    expect((archiveUpdate?.args[0] as { archived_at: string }).archived_at).toEqual(
      expect.any(String),
    );

    const restore = mockSupabase({ maybeSingle: [mockQueryResult({ id: "app-1" })] });
    await createApplicationService(restore.client).restoreApplication("user-a", "app-1");
    const restoreUpdate = restore.calls.find((call) => call.method === "update");
    expect((restoreUpdate?.args[0] as { archived_at: null }).archived_at).toBeNull();
  });

  it("throws not found when archiving or restoring a foreign application", async () => {
    const missing = mockSupabase({ maybeSingle: [mockQueryResult(null)] });
    const service = createApplicationService(missing.client);
    await expect(service.archiveApplication("user-b", "app-of-a")).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(service.restoreApplication("user-b", "app-of-a")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
