import { z } from "zod";

export const SKILL_CATEGORIES = [
  "programming_languages",
  "frameworks",
  "cloud_platforms",
  "tools",
  "concepts",
  "spoken_languages",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  programming_languages: "Programming languages",
  frameworks: "Frameworks",
  cloud_platforms: "Cloud platforms",
  tools: "Tools",
  concepts: "Concepts",
  spoken_languages: "Spoken languages",
};

/** Normalizes a skill name for deduplication: lowercase, trimmed, collapsed spaces. */
export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A valid http(s) URL, empty string, null, or undefined (all meaning "not set"). */
const optionalHttpUrl = z
  .string()
  .trim()
  .nullish()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must start with http:// or https://." },
  )
  .transform((value) => (value ? value : null));

/** A YYYY-MM-DD calendar date, empty string, null, or undefined (meaning "not set"). */
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .refine(
    (value) => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    { message: "Enter a valid date (YYYY-MM-DD)." },
  )
  .transform((value) => (value ? value : null));

const tagList = z
  .array(z.string().trim())
  .default([])
  .transform((items) => items.filter((item) => item.length > 0));

const requiredText = (message: string) => z.string().trim().min(1, message);

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null));

function datesInOrder(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
  startKey: string,
  endKey: string,
  path: string,
) {
  const start = data[startKey];
  const end = data[endKey];
  if (
    typeof start === "string" &&
    typeof end === "string" &&
    start !== "" &&
    end !== "" &&
    end < start
  ) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: "End date cannot be earlier than the start date.",
    });
  }
}

/** Shared URL/date validation for the profile basic information + preferences. */
export const profileBasicSchema = z.object({
  preferred_name: requiredText("Preferred name is required."),
  phone: optionalText,
  location: optionalText,
  linkedin_url: optionalHttpUrl,
  github_url: optionalHttpUrl,
  website_url: optionalHttpUrl,
  preferred_locations: tagList,
  remote_preference: optionalText,
  preferred_work_term_lengths: tagList,
  target_roles: tagList,
  available_start_date: optionalDate,
});

export type ProfileBasicInput = z.input<typeof profileBasicSchema>;
export type ProfileBasicValues = z.output<typeof profileBasicSchema>;

export const educationSchema = z
  .object({
    school: requiredText("School is required."),
    degree: requiredText("Degree is required."),
    program: requiredText("Program is required."),
    start_date: optionalDate,
    expected_graduation_date: optionalDate,
    relevant_coursework: tagList,
  })
  .superRefine((data, ctx) => {
    datesInOrder(data, ctx, "start_date", "expected_graduation_date", "expected_graduation_date");
  });

export type EducationInput = z.input<typeof educationSchema>;
export type EducationValues = z.output<typeof educationSchema>;

export const skillInputSchema = z.object({
  category: z.enum(SKILL_CATEGORIES),
  name: requiredText("Skill name is required."),
});

export type SkillInput = z.input<typeof skillInputSchema>;

export const experienceSchema = z
  .object({
    title: requiredText("Title is required."),
    organization: requiredText("Organization is required."),
    location: optionalText,
    start_date: optionalDate,
    end_date: optionalDate,
    description: optionalText,
    bullet_points: tagList,
  })
  .superRefine((data, ctx) => {
    datesInOrder(data, ctx, "start_date", "end_date", "end_date");
  });

export type ExperienceInput = z.input<typeof experienceSchema>;
export type ExperienceValues = z.output<typeof experienceSchema>;

export const projectSchema = z
  .object({
    name: requiredText("Project name is required."),
    technologies: tagList,
    start_date: optionalDate,
    end_date: optionalDate,
    description: optionalText,
    bullet_points: tagList,
    github_url: optionalHttpUrl,
    demo_url: optionalHttpUrl,
  })
  .superRefine((data, ctx) => {
    datesInOrder(data, ctx, "start_date", "end_date", "end_date");
  });

export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;

export const orderedIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
