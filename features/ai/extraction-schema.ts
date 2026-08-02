import { z } from "zod";

/**
 * Schema-validated job extraction result (Phase 3). Unknown values stay
 * null/empty; nothing is inferred from silence. The complete original
 * description is always preserved.
 */
export const jobExtractionResultSchema = z.object({
  company: z.string().trim().min(1).nullable(),
  job_title: z.string().trim().min(1).nullable(),
  location: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  work_arrangement: z.string().trim().min(1).nullable(),
  employment_type: z.string().trim().min(1).nullable(),
  work_term_duration: z.string().trim().min(1).nullable(),
  deadline: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .nullable(),
  salary_text: z.string().trim().min(1).nullable(),
  education_requirements: z.array(z.string().trim().min(1)),
  years_of_experience: z.string().trim().min(1).nullable(),
  posting_url: z
    .string()
    .trim()
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })
    .nullable(),
  responsibilities: z.array(z.string().trim().min(1)),
  qualifications: z.array(z.string().trim().min(1)),
  original_description: z.string().trim().min(1),
  mode: z.literal("demo").or(z.literal("external")),
});

export type JobExtractionResult = z.output<typeof jobExtractionResultSchema>;
