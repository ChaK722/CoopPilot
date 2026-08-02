import { describe, expect, it } from "vitest";
import {
  analysisInputSchema,
  applicationSchema,
  createApplicationInputSchema,
  interviewSchema,
} from "@/lib/validation/applications";

const validApplication = {
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
  original_description: "A real job posting.",
  responsibilities: [],
  qualifications: [],
};

describe("applicationSchema", () => {
  it("accepts a valid application", () => {
    expect(applicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it("rejects a missing company and job title", () => {
    const result = applicationSchema.safeParse({
      ...validApplication,
      company: "",
      job_title: " ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty or whitespace-only original description", () => {
    expect(
      applicationSchema.safeParse({ ...validApplication, original_description: "   " }).success,
    ).toBe(false);
  });

  it("only accepts http/https posting URLs", () => {
    expect(
      applicationSchema.safeParse({ ...validApplication, posting_url: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({ ...validApplication, posting_url: "https://jobs.example.com" })
        .success,
    ).toBe(true);
  });

  it("validates the deadline format", () => {
    expect(
      applicationSchema.safeParse({ ...validApplication, deadline: "2026-13-45" }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({ ...validApplication, deadline: "2026-09-15" }).success,
    ).toBe(true);
  });
});

describe("analysisInputSchema", () => {
  it("rejects an empty description", () => {
    expect(analysisInputSchema.safeParse({ description: "" }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ description: "   " }).success).toBe(false);
  });

  it("accepts a non-empty description with an optional URL", () => {
    expect(analysisInputSchema.safeParse({ description: "Job text" }).success).toBe(true);
    expect(
      analysisInputSchema.safeParse({
        description: "Job text",
        url: "https://example.com/job",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-http URL", () => {
    expect(analysisInputSchema.safeParse({ description: "Job text", url: "ftp://x" }).success).toBe(
      false,
    );
  });
});

describe("createApplicationInputSchema", () => {
  it("requires a valid creation key", () => {
    expect(
      createApplicationInputSchema.safeParse({
        ...validApplication,
        creation_key: "not-a-uuid",
        skills: [],
      }).success,
    ).toBe(false);
    expect(
      createApplicationInputSchema.safeParse({
        ...validApplication,
        creation_key: "11111111-1111-4111-8111-111111111111",
        skills: [],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid skill requirement types", () => {
    const result = createApplicationInputSchema.safeParse({
      ...validApplication,
      creation_key: "11111111-1111-4111-8111-111111111111",
      skills: [{ requirement_type: "bonus", name: "TypeScript" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("interviewSchema", () => {
  it("requires a type and a valid datetime", () => {
    expect(interviewSchema.safeParse({ interview_type: "", scheduled_at: "" }).success).toBe(false);
    expect(
      interviewSchema.safeParse({
        interview_type: "Technical",
        scheduled_at: "2026-08-05T18:30:00.000Z",
      }).success,
    ).toBe(true);
  });
});
