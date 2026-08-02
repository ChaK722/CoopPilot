import { z } from "zod";

export const scoreComponentSchema = z.object({
  score: z.number().int().min(0),
  max: z.number().int().min(1),
  explanation: z.string().min(1),
});

export const scoreBreakdownSchema = z.object({
  required_skills: scoreComponentSchema,
  preferred_skills: scoreComponentSchema,
  relevant_experience: scoreComponentSchema,
  education: scoreComponentSchema,
  location_availability: scoreComponentSchema,
});

export const matchAnalysisResultSchema = z
  .object({
    overall_score: z.number().int().min(0).max(100),
    score_breakdown: scoreBreakdownSchema,
    matching_skills: z.array(
      z.object({
        name: z.string().min(1),
        evidence: z.string().min(1),
      }),
    ),
    missing_required_skills: z.array(z.string()),
    missing_preferred_skills: z.array(z.string()),
    matching_experience: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1),
        evidence: z.string().min(1),
      }),
    ),
    relevant_projects: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        evidence: z.string().min(1),
      }),
    ),
    keywords: z.array(z.string()),
    suggestions: z.array(z.string()),
    profile_source_hash: z.string().min(1),
    application_source_hash: z.string().min(1),
    mode: z.literal("demo").or(z.literal("external")),
  })
  .superRefine((data, ctx) => {
    const total =
      data.score_breakdown.required_skills.score +
      data.score_breakdown.preferred_skills.score +
      data.score_breakdown.relevant_experience.score +
      data.score_breakdown.education.score +
      data.score_breakdown.location_availability.score;
    if (total !== data.overall_score) {
      ctx.addIssue({
        code: "custom",
        message: "Component scores must sum to the overall score.",
      });
    }
  });

export type MatchAnalysisResult = z.output<typeof matchAnalysisResultSchema>;

export const coverLetterResultSchema = z.object({
  sufficient: z.boolean(),
  prompt: z.string().optional(),
  content: z.string().optional(),
  mode: z.literal("demo").or(z.literal("external")),
});

export type CoverLetterResult = z.output<typeof coverLetterResultSchema>;

export const prepQuestionSchema = z.object({
  question: z.string().min(1),
  why: z.string().min(1),
  relevant_experience: z.string().min(1),
  outline: z.string().optional(),
});

export const interviewPrepResultSchema = z.object({
  behavioural_questions: z.array(prepQuestionSchema),
  technical_questions: z.array(prepQuestionSchema),
  research_checklist: z.array(z.string().min(1)),
  mode: z.literal("demo").or(z.literal("external")),
});

export type InterviewPrepResult = z.output<typeof interviewPrepResultSchema>;

/** Structural input bundles passed to providers (server-assembled facts). */
export interface MatchInput {
  profileSkills: Array<{ id: string; name: string; normalized_name: string; category: string }>;
  experiences: Array<{ id: string; title: string; organization: string; bullet_points: string[] }>;
  projects: Array<{ id: string; name: string; description: string | null; technologies: string[] }>;
  educations: Array<{ id: string; school: string; degree: string; program: string }>;
  location: string | null;
  availableStartDate: string | null;
  application: {
    company: string;
    job_title: string;
    responsibilities: string[];
    qualifications: string[];
    requiredSkills: Array<{ name: string; normalized_name: string }>;
    preferredSkills: Array<{ name: string; normalized_name: string }>;
  };
  profileSourceHash: string;
  applicationSourceHash: string;
}

export interface CoverLetterInput {
  profile: {
    preferredName: string | null;
    location: string | null;
    experiences: Array<{
      id: string;
      title: string;
      organization: string;
      bullet_points: string[];
    }>;
    projects: Array<{
      id: string;
      name: string;
      technologies: string[];
      description: string | null;
    }>;
    educations: Array<{ id: string; school: string; degree: string; program: string }>;
  };
  application: {
    company: string;
    job_title: string;
    responsibilities: string[];
    qualifications: string[];
  };
}

export interface InterviewPrepInput {
  profileSkills: Array<{ id: string; name: string; normalized_name: string }>;
  experiences: Array<{ id: string; title: string; organization: string; bullet_points: string[] }>;
  projects: Array<{ id: string; name: string; description: string | null }>;
  application: {
    company: string;
    job_title: string;
    requiredSkills: Array<{ name: string; normalized_name: string }>;
    preferredSkills: Array<{ name: string; normalized_name: string }>;
  };
}
