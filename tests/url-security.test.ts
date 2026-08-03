import { describe, expect, it } from "vitest";
import { interviewSchema } from "@/lib/validation/applications";
import { profileBasicSchema, projectSchema } from "@/lib/validation/profile";
import { applicationSchema } from "@/lib/validation/applications";

const DANGEROUS_SCHEMES = [
  "javascript:alert(1)",
  "data:text/html,x",
  "file:///etc/passwd",
  "vbscript:msgbox(1)",
];

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
  original_description: "Job text",
  responsibilities: [],
  qualifications: [],
};

const validProfile = {
  preferred_name: "Alex",
  phone: "",
  location: "",
  linkedin_url: "",
  github_url: "",
  website_url: "",
  preferred_locations: [],
  remote_preference: "",
  preferred_work_term_lengths: [],
  target_roles: [],
  available_start_date: "",
};

const validProject = {
  name: "Project",
  technologies: [],
  start_date: "",
  end_date: "",
  description: "",
  bullet_points: [],
  github_url: "",
  demo_url: "",
};

describe("Phase 7 URL scheme security", () => {
  it("rejects dangerous schemes for the posting URL", () => {
    for (const scheme of DANGEROUS_SCHEMES) {
      expect(
        applicationSchema.safeParse({ ...validApplication, posting_url: scheme }).success,
      ).toBe(false);
    }
    expect(
      applicationSchema.safeParse({
        ...validApplication,
        posting_url: "https://jobs.example.com/1",
      }).success,
    ).toBe(true);
  });

  it("rejects dangerous schemes for profile LinkedIn, GitHub, and website URLs", () => {
    for (const field of ["linkedin_url", "github_url", "website_url"] as const) {
      for (const scheme of DANGEROUS_SCHEMES) {
        expect(profileBasicSchema.safeParse({ ...validProfile, [field]: scheme }).success).toBe(
          false,
        );
      }
    }
  });

  it("rejects dangerous schemes for project GitHub and demo URLs", () => {
    for (const field of ["github_url", "demo_url"] as const) {
      for (const scheme of DANGEROUS_SCHEMES) {
        expect(projectSchema.safeParse({ ...validProject, [field]: scheme }).success).toBe(false);
      }
    }
  });

  it("rejects dangerous schemes for interview links but allows plain locations", () => {
    for (const scheme of DANGEROUS_SCHEMES) {
      expect(
        interviewSchema.safeParse({
          interview_type: "Technical",
          scheduled_at: "2026-08-05T15:00:00.000Z",
          location_or_link: scheme,
          notes: "",
        }).success,
      ).toBe(false);
    }
    expect(
      interviewSchema.safeParse({
        interview_type: "Technical",
        scheduled_at: "2026-08-05T15:00:00.000Z",
        location_or_link: "https://meet.example.com/room",
        notes: "",
      }).success,
    ).toBe(true);
    expect(
      interviewSchema.safeParse({
        interview_type: "Technical",
        scheduled_at: "2026-08-05T15:00:00.000Z",
        location_or_link: "Room 4B, Engineering Building",
        notes: "",
      }).success,
    ).toBe(true);
  });
});
