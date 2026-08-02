import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceSpies = {
  createApplication: vi.fn().mockResolvedValue("app-1"),
  updateApplication: vi.fn().mockResolvedValue(undefined),
  deleteApplication: vi.fn().mockResolvedValue(undefined),
  duplicateApplication: vi.fn().mockResolvedValue("app-2"),
  saveNotes: vi.fn().mockResolvedValue(undefined),
  createInterview: vi.fn().mockResolvedValue({ id: "i-1" }),
  deleteInterview: vi.fn().mockResolvedValue({ id: "i-1", application_id: "app-1" }),
};

const extractJob = vi.fn().mockResolvedValue({
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
});

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/auth/route-guards", () => ({
  requireUser: () => Promise.resolve({ id: "user-a" }),
}));

vi.mock("@/lib/auth/supabase-server", () => ({
  createServerSupabaseClient: () => Promise.resolve({}),
}));

vi.mock("@/features/applications/application-service", () => ({
  createApplicationService: () => serviceSpies,
}));

vi.mock("@/features/ai/provider", () => ({
  getAIProvider: () => Promise.resolve({ extractJob }),
}));

import {
  analyzeJob,
  createApplication,
  createInterview,
  deleteApplication,
  deleteInterview,
  duplicateApplication,
  saveApplicationNotes,
  updateApplication,
} from "@/features/applications/application-actions";

const VALID = {
  company: "Acme",
  job_title: "Intern",
  location: "",
  country: "",
  work_arrangement: "",
  employment_type: "",
  work_term_duration: "",
  deadline: "",
  salary_text: "",
  education_requirements: [],
  years_of_experience: "",
  posting_url: "",
  original_description: "Job text",
  responsibilities: [],
  qualifications: [],
};

describe("application server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty description before calling the provider", async () => {
    const result = await analyzeJob({ description: "   " });
    expect(result.ok).toBe(false);
    expect(extractJob).not.toHaveBeenCalled();
  });

  it("analyzes a valid description through the provider and returns a validated result", async () => {
    const result = await analyzeJob({ description: "Job text" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.mode).toBe("demo");
      expect(result.result.original_description).toBe("Job text");
    }
  });

  it("rejects invalid creation input before touching the service", async () => {
    const result = await createApplication({ ...VALID, creation_key: "bad", skills: [] });
    expect(result.ok).toBe(false);
    expect(serviceSpies.createApplication).not.toHaveBeenCalled();
  });

  it("rejects invalid application ids before touching the service", async () => {
    expect((await deleteApplication("nope")).ok).toBe(false);
    expect((await duplicateApplication("nope")).ok).toBe(false);
    expect((await saveApplicationNotes("nope", { notes: "x" })).ok).toBe(false);
    expect(serviceSpies.deleteApplication).not.toHaveBeenCalled();
    expect(serviceSpies.duplicateApplication).not.toHaveBeenCalled();
    expect(serviceSpies.saveNotes).not.toHaveBeenCalled();
  });

  it("passes valid input to the service", async () => {
    const result = await createApplication({
      ...VALID,
      creation_key: "11111111-1111-4111-8111-111111111111",
      skills: [{ requirement_type: "required", name: "TypeScript" }],
    });
    expect(result.ok).toBe(true);
    expect(serviceSpies.createApplication).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ company: "Acme" }),
    );
  });

  it("rejects invalid interview payloads before touching the service", async () => {
    const result = await createInterview("app-1", { interview_type: "", scheduled_at: "" });
    expect(result.ok).toBe(false);
    expect(serviceSpies.createInterview).not.toHaveBeenCalled();
  });

  it("deletes interviews with a valid id", async () => {
    const result = await deleteInterview("11111111-1111-4111-8111-111111111111");
    expect(result.ok).toBe(true);
    expect(serviceSpies.deleteInterview).toHaveBeenCalledWith(
      "user-a",
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("validates update input before touching the service", async () => {
    const result = await updateApplication("app-1", { ...VALID, company: "" });
    expect(result.ok).toBe(false);
    expect(serviceSpies.updateApplication).not.toHaveBeenCalled();
  });
});
