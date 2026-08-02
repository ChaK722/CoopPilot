import { beforeEach, describe, expect, it, vi } from "vitest";

const profileService = { getProfileBundle: vi.fn() };
const applicationService = { getApplication: vi.fn() };
const provider = {
  analyzeMatch: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateInterviewPrep: vi.fn(),
};

vi.mock("@/features/profile/profile-service", () => ({
  createProfileService: () => profileService,
}));

vi.mock("@/features/applications/application-service", () => ({
  createApplicationService: () => applicationService,
}));

vi.mock("@/features/ai/provider", () => ({
  getAIProvider: () => Promise.resolve(provider),
  withProviderTimeout: (promise: Promise<unknown>) => promise,
}));

import { createAIService } from "@/features/ai/ai-service";

function mockSupabase(results: Record<string, unknown[]>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
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
            return (results[prop] ?? []).shift() ?? { data: null, error: null };
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
    return (results.rpc ?? []).shift() ?? { data: null, error: null };
  });
  return { client: { from, rpc } as never, calls, mocks: { from, rpc } };
}

const profileBundle = {
  profile: { preferred_name: "Alex", location: "Toronto", available_start_date: null },
  skills: [{ id: "s1", name: "TypeScript", normalized_name: "typescript", category: "languages" }],
  experiences: [{ id: "e1", title: "Intern", organization: "Acme", bullet_points: ["Built API"] }],
  projects: [],
  educations: [{ id: "ed1", school: "Waterloo", degree: "BSc", program: "CS" }],
};

const applicationBundle = {
  application: {
    id: "app-1",
    company: "Acme",
    job_title: "Developer Co-op",
    location: null,
    work_arrangement: null,
    responsibilities: ["Build features"],
    qualifications: ["TypeScript"],
  },
  skills: [
    {
      requirement_type: "required",
      name: "TypeScript",
      normalized_name: "typescript",
    },
    { requirement_type: "preferred", name: "AWS", normalized_name: "aws" },
  ],
  events: [],
  interviews: [],
};

const VALID_MATCH = {
  overall_score: 70,
  score_breakdown: {
    required_skills: { score: 40, max: 40, explanation: "hit" },
    preferred_skills: { score: 0, max: 20, explanation: "miss" },
    relevant_experience: { score: 20, max: 20, explanation: "yes" },
    education: { score: 10, max: 10, explanation: "yes" },
    location_availability: { score: 0, max: 10, explanation: "no" },
  },
  matching_skills: [{ name: "TypeScript", evidence: "profile" }],
  missing_required_skills: [],
  missing_preferred_skills: ["AWS"],
  matching_experience: [
    {
      id: "11111111-1111-4111-8111-111111111201",
      title: "Intern",
      evidence: "Intern at Acme",
    },
  ],
  relevant_projects: [],
  keywords: ["TypeScript"],
  suggestions: ["Highlight real results"],
  profile_source_hash: "hp",
  application_source_hash: "ha",
  mode: "demo",
};

describe("createAIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileService.getProfileBundle.mockResolvedValue(profileBundle);
    applicationService.getApplication.mockResolvedValue(applicationBundle);
  });

  it("generates a match analysis through the provider and inserts it", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: [{ id: "run-1", status: "running" }], error: null },
        { data: "analysis-1", error: null },
        { data: null, error: null },
      ],
    });
    provider.analyzeMatch.mockResolvedValue(VALID_MATCH);
    const service = createAIService(supabase.client);

    const result = await service.generateMatchAnalysis(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.overall_score).toBe(70);
    const insertCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_match_analysis",
    );
    expect(insertCall).toBeDefined();
    expect((insertCall?.args[1] as { p_run_id: string }).p_run_id).toBe("run-1");
  });

  it("skips the provider when the idempotent run already succeeded", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: [{ id: "run-1", status: "succeeded" }], error: null }],
      single: [{ data: VALID_MATCH, error: null }],
    });
    const service = createAIService(supabase.client);

    const result = await service.generateMatchAnalysis(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.overall_score).toBe(70);
    expect(provider.analyzeMatch).not.toHaveBeenCalled();
  });

  it("marks the run failed when provider output is schema-invalid", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: [{ id: "run-1", status: "running" }], error: null },
        { data: null, error: null },
      ],
    });
    provider.analyzeMatch.mockResolvedValue({ ...VALID_MATCH, overall_score: 999 });
    const service = createAIService(supabase.client);

    await expect(
      service.generateMatchAnalysis("user-a", "app-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ kind: "ai_unavailable" });

    const completeCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "complete_ai_run",
    );
    expect(completeCall).toBeDefined();
    expect((completeCall?.args[1] as { p_status: string }).p_status).toBe("failed");
  });

  it("throws an actionable validation error when the cover letter is insufficient", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: [{ id: "run-1", status: "running" }], error: null }],
    });
    provider.generateCoverLetter.mockResolvedValue({
      sufficient: false,
      prompt: "Add at least one experience to your profile.",
      mode: "demo",
    });
    const service = createAIService(supabase.client);

    await expect(
      service.generateCoverLetter("user-a", "app-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("saves cover letter edits as user_edited documents", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: [{ id: "run-1", status: "running" }], error: null },
        { data: 2, error: null },
      ],
    });
    const service = createAIService(supabase.client);

    await service.saveCoverLetterEdit("user-a", "app-1", "Edited letter");

    const insertCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_generated_document",
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[1]).toEqual(
      expect.objectContaining({
        p_document_type: "cover_letter",
        p_content_text: "Edited letter",
        p_user_edited: true,
      }),
    );
  });

  it("restores a previous cover letter version as a new revision", async () => {
    const supabase = mockSupabase({
      maybeSingle: [{ data: { content_text: "Old letter" }, error: null }],
      rpc: [
        { data: [{ id: "run-1", status: "running" }], error: null },
        { data: 3, error: null },
      ],
    });
    const service = createAIService(supabase.client);

    await service.restoreCoverLetterVersion("user-a", "app-1", 1);

    const insertCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_generated_document",
    );
    expect((insertCall?.args[1] as { p_content_text: string }).p_content_text).toBe("Old letter");
  });

  it("returns the AI bundle with a stale flag when hashes differ", async () => {
    const supabase = mockSupabase({
      maybeSingle: [
        {
          data: {
            id: "m1",
            profile_source_hash: "old",
            application_source_hash: "ha",
            overall_score: 70,
          },
          error: null,
        },
      ],
    });
    const service = createAIService(supabase.client);

    const bundle = await service.getAIBundle("user-a", "app-1");
    expect(bundle.matchStale).toBe(true);
    expect(bundle.match.overall_score).toBe(70);
    expect(bundle.coverLetter).toBeNull();
  });
});
