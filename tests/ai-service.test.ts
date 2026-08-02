import { beforeEach, describe, expect, it, vi } from "vitest";

const profileService = { getProfileBundle: vi.fn() };
const applicationService = { getApplication: vi.fn() };
const provider = {
  analyzeMatch: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateInterviewPrep: vi.fn(),
  extractJob: vi.fn(),
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
import { AppError } from "@/lib/errors";

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
  return { client: { from, rpc } as never, calls };
}

const profileBundle = {
  profile: { preferred_name: "Alex", location: "Toronto", available_start_date: null },
  skills: [
    {
      id: "11111111-1111-4111-8111-111111111101",
      name: "TypeScript",
      normalized_name: "typescript",
      category: "languages",
    },
  ],
  experiences: [
    {
      id: "11111111-1111-4111-8111-111111111201",
      title: "Intern",
      organization: "Acme",
      bullet_points: ["Built API"],
    },
  ],
  projects: [],
  educations: [
    {
      id: "11111111-1111-4111-8111-111111111401",
      school: "Waterloo",
      degree: "BSc",
      program: "CS",
    },
  ],
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
    { requirement_type: "required", name: "TypeScript", normalized_name: "typescript" },
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
    { id: "11111111-1111-4111-8111-111111111201", title: "Intern", evidence: "Intern at Acme" },
  ],
  relevant_projects: [],
  keywords: ["TypeScript"],
  suggestions: ["Highlight real results"],
  profile_source_hash: "hp",
  application_source_hash: "ha",
  mode: "demo",
};

const VALID_EXTRACTION = {
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
  responsibilities: [],
  qualifications: [],
  original_description: "Job text",
  mode: "demo",
};

function runRow(status: string, created = true) {
  return [{ id: "run-1", status, created, safe_error_message: null }];
}

describe("createAIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileService.getProfileBundle.mockResolvedValue(profileBundle);
    applicationService.getApplication.mockResolvedValue(applicationBundle);
  });

  it("runs the provider only when created=true and inserts the match", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: runRow("running", true), error: null },
        { data: "analysis-1", error: null },
      ],
      maybeSingle: [{ data: { ...VALID_MATCH, id: "analysis-1" }, error: null }],
    });
    provider.analyzeMatch.mockResolvedValue(VALID_MATCH);
    const service = createAIService(supabase.client);

    const result = await service.generateMatchAnalysis(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(provider.analyzeMatch).toHaveBeenCalledTimes(1);
    expect(result.overall_score).toBe(70);
    const insertCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_match_analysis",
    );
    expect(insertCall).toBeDefined();
    expect((insertCall?.args[1] as { p_run_id: string }).p_run_id).toBe("run-1");
  });

  it("returns the run-bound result for a succeeded retry without calling the provider", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: runRow("succeeded", false), error: null }],
      maybeSingle: [{ data: { ...VALID_MATCH, id: "analysis-1" }, error: null }],
    });
    const service = createAIService(supabase.client);

    const result = await service.generateMatchAnalysis(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.id).toBe("analysis-1");
    expect(provider.analyzeMatch).not.toHaveBeenCalled();
  });

  it("reports an in-progress request for a running duplicate key", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: runRow("running", false), error: null }],
    });
    const service = createAIService(supabase.client);

    await expect(
      service.generateMatchAnalysis("user-a", "app-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(provider.analyzeMatch).not.toHaveBeenCalled();
  });

  it("returns the safe failure message for a failed duplicate key without re-running", async () => {
    const supabase = mockSupabase({
      rpc: [
        {
          data: [
            {
              id: "run-1",
              status: "failed",
              created: false,
              safe_error_message: "The analysis provider is unavailable.",
            },
          ],
          error: null,
        },
      ],
    });
    const service = createAIService(supabase.client);

    await expect(
      service.generateMatchAnalysis("user-a", "app-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({
      kind: "ai_unavailable",
      safeMessage: "The analysis provider is unavailable.",
    });
    expect(provider.analyzeMatch).not.toHaveBeenCalled();
  });

  it("marks the run failed when provider output is schema-invalid", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: runRow("running", true), error: null },
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
      rpc: [
        { data: runRow("running", true), error: null },
        { data: null, error: null },
      ],
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

  it("saves cover letter edits as revisions without creating an AI run", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: 2, error: null }],
    });
    const service = createAIService(supabase.client);

    await service.saveCoverLetterEdit("user-a", "app-1", "Edited letter");

    expect(
      supabase.calls.some((call) => call.method === "rpc" && call.args[0] === "create_ai_run"),
    ).toBe(false);
    const revisionCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_cover_letter_revision",
    );
    expect(revisionCall).toBeDefined();
    expect(revisionCall?.args[1]).toEqual(
      expect.objectContaining({
        p_content: "Edited letter",
        p_revision_source: "edited",
      }),
    );
  });

  it("restores a previous version as a revision without creating an AI run", async () => {
    const supabase = mockSupabase({
      maybeSingle: [{ data: { content_text: "Old letter" }, error: null }],
      rpc: [{ data: 3, error: null }],
    });
    const service = createAIService(supabase.client);

    await service.restoreCoverLetterVersion("user-a", "app-1", 1);

    expect(
      supabase.calls.some((call) => call.method === "rpc" && call.args[0] === "create_ai_run"),
    ).toBe(false);
    const revisionCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "insert_cover_letter_revision",
    );
    expect((revisionCall?.args[1] as { p_revision_source: string }).p_revision_source).toBe(
      "restored",
    );
  });

  it("generates interview prep through one atomic bundle RPC", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: runRow("running", true), error: null },
        { data: null, error: null },
      ],
      maybeSingle: [
        { data: { id: "b1", content_json: { questions: [] } }, error: null },
        { data: { id: "t1", content_json: { questions: [] } }, error: null },
        { data: { id: "r1", content_json: { items: [] } }, error: null },
      ],
    });
    provider.generateInterviewPrep.mockResolvedValue({
      behavioural_questions: [],
      technical_questions: [],
      research_checklist: [],
      mode: "demo",
    });
    const service = createAIService(supabase.client);

    const result = await service.generateInterviewPrep(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    const bundleCalls = supabase.calls.filter(
      (call) => call.method === "rpc" && call.args[0] === "insert_interview_prep_bundle",
    );
    expect(bundleCalls).toHaveLength(1);
    expect(supabase.calls.some((call) => call.args[0] === "insert_generated_document")).toBe(false);
    expect(result.behavioural.id).toBe("b1");
    expect(result.technical.id).toBe("t1");
    expect(result.research.id).toBe("r1");
  });

  it("returns the complete three-part bundle for a succeeded interview prep retry", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: runRow("succeeded", false), error: null }],
      maybeSingle: [
        { data: { id: "b1" }, error: null },
        { data: { id: "t1" }, error: null },
        { data: { id: "r1" }, error: null },
      ],
    });
    const service = createAIService(supabase.client);

    const result = await service.generateInterviewPrep(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(provider.generateInterviewPrep).not.toHaveBeenCalled();
    expect(result.behavioural.id).toBe("b1");
    expect(result.technical.id).toBe("t1");
    expect(result.research.id).toBe("r1");
  });

  it("analyzes a job through the unified run lifecycle", async () => {
    const supabase = mockSupabase({
      rpc: [
        { data: runRow("running", true), error: null },
        { data: null, error: null },
      ],
    });
    provider.extractJob.mockResolvedValue(VALID_EXTRACTION);
    const service = createAIService(supabase.client);

    const result = await service.analyzeJob(
      "user-a",
      { description: "Job text", url: null },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(provider.extractJob).toHaveBeenCalledTimes(1);
    expect(result.original_description).toBe("Job text");
    const saveCall = supabase.calls.find(
      (call) => call.method === "rpc" && call.args[0] === "save_job_extraction_result",
    );
    expect(saveCall).toBeDefined();
  });

  it("reads the stored result for a succeeded job extraction retry", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: runRow("succeeded", false), error: null }],
      maybeSingle: [{ data: { result_json: VALID_EXTRACTION }, error: null }],
    });
    const service = createAIService(supabase.client);

    const result = await service.analyzeJob(
      "user-a",
      { description: "Job text", url: null },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(provider.extractJob).not.toHaveBeenCalled();
    expect(result.original_description).toBe("Job text");
  });

  it("does not re-run the provider when two service calls share a running key", async () => {
    let first = true;
    provider.analyzeMatch.mockImplementation(async () => {
      if (first) {
        first = false;
        return VALID_MATCH;
      }
      throw new Error("provider should not be called twice");
    });

    const results = mockSupabase({
      rpc: [
        { data: runRow("running", true), error: null },
        { data: "analysis-1", error: null },
        { data: runRow("running", false), error: null },
      ],
      maybeSingle: [{ data: { ...VALID_MATCH, id: "analysis-1" }, error: null }],
    });
    const service = createAIService(results.client);

    const firstResult = await service.generateMatchAnalysis(
      "user-a",
      "app-1",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(firstResult.overall_score).toBe(70);

    await expect(
      service.generateMatchAnalysis("user-a", "app-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toBeInstanceOf(AppError);
    expect(provider.analyzeMatch).toHaveBeenCalledTimes(1);
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
