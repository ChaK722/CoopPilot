import { z } from "zod";
import {
  optionalDate,
  optionalHttpUrl,
  optionalText,
  requiredText,
  tagList,
} from "@/lib/validation/shared";

export const APPLICATION_STATUSES = [
  "saved",
  "preparing",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  preparing: "Preparing",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Every job field stored on an application (shared by analysis + review). */
export const applicationSchema = z.object({
  company: requiredText("Company is required."),
  job_title: requiredText("Job title is required."),
  location: optionalText,
  country: optionalText,
  work_arrangement: optionalText,
  employment_type: optionalText,
  work_term_duration: optionalText,
  deadline: optionalDate,
  salary_text: optionalText,
  education_requirements: tagList,
  years_of_experience: optionalText,
  posting_url: optionalHttpUrl,
  original_description: requiredText("The original description is required."),
  responsibilities: tagList,
  qualifications: tagList,
});

export type ApplicationValues = z.output<typeof applicationSchema>;

export const analysisInputSchema = z.object({
  description: requiredText("Please paste a job description."),
  url: optionalHttpUrl,
});

export type AnalysisInput = z.input<typeof analysisInputSchema>;

export const applicationSkillInputSchema = z.object({
  requirement_type: z.enum(["required", "preferred"]),
  name: requiredText("Skill name is required."),
});

export type ApplicationSkillInput = z.input<typeof applicationSkillInputSchema>;

export const createApplicationInputSchema = applicationSchema.extend({
  creation_key: z.string().uuid("Invalid creation key."),
  skills: z.array(applicationSkillInputSchema).max(200).default([]),
});

export type CreateApplicationInput = z.input<typeof createApplicationInputSchema>;

export const interviewSchema = z.object({
  interview_type: requiredText("Interview type is required."),
  scheduled_at: z.string().datetime("Enter a valid date and time."),
  location_or_link: optionalText.refine(
    (value) => {
      if (!value) return true;
      // Plain room/location text is allowed; anything that looks like a URL
      // must be http(s). This rejects javascript:, data:, file:, vbscript:.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Links must start with http:// or https://." },
  ),
  notes: optionalText,
});

export type InterviewInput = z.input<typeof interviewSchema>;
export type InterviewValues = z.output<typeof interviewSchema>;

export const notesSchema = z.object({
  notes: z.string().max(100_000),
});

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export const requiredSkillSchema = z.object({
  skill: requiredText("Skill is required."),
});
