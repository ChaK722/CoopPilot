import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { createProfileService } from "@/features/profile/profile-service";
import { createApplicationService } from "@/features/applications/application-service";
import { getAIProvider, withProviderTimeout } from "@/features/ai/provider";
import {
  coverLetterResultSchema,
  interviewPrepResultSchema,
  matchAnalysisResultSchema,
  type CoverLetterInput,
  type InterviewPrepInput,
  type MatchInput,
} from "@/features/ai/schemas";
import { applicationSourceHash, profileSourceHash } from "@/features/ai/source-hashes";
import type { JobExtractionResult } from "@/features/ai/extraction-schema";

const LIST_LIMIT = 100;

type DbClient = SupabaseClient;

function notFound(): AppError {
  return new AppError("not_found", "The application was not found or is not yours.");
}

export function createAIService(supabase: DbClient) {
  const profileService = createProfileService(supabase);
  const applicationService = createApplicationService(supabase);

  async function loadApplicationData(userId: string, applicationId: string) {
    const app = await applicationService.getApplication(userId, applicationId);
    if (!app.application) throw notFound();
    return app;
  }

  async function loadProfileData(userId: string) {
    const bundle = await profileService.getProfileBundle(userId);
    return bundle;
  }

  function toMatchInput(
    userId: string,
    application: Awaited<ReturnType<typeof loadApplicationData>>,
    profile: Awaited<ReturnType<typeof loadProfileData>>,
  ): MatchInput {
    return {
      profileSkills: profile.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        normalized_name: skill.normalized_name,
        category: skill.category,
      })),
      experiences: profile.experiences.map((experience) => ({
        id: experience.id,
        title: experience.title,
        organization: experience.organization,
        bullet_points: experience.bullet_points ?? [],
      })),
      projects: profile.projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        technologies: project.technologies ?? [],
      })),
      educations: profile.educations.map((education) => ({
        id: education.id,
        school: education.school,
        degree: education.degree,
        program: education.program,
      })),
      location: profile.profile?.location ?? null,
      availableStartDate: profile.profile?.available_start_date ?? null,
      application: {
        company: application.application.company,
        job_title: application.application.job_title,
        responsibilities: application.application.responsibilities ?? [],
        qualifications: application.application.qualifications ?? [],
        requiredSkills: application.skills
          .filter((skill) => skill.requirement_type === "required")
          .map((skill) => ({ name: skill.name, normalized_name: skill.normalized_name })),
        preferredSkills: application.skills
          .filter((skill) => skill.requirement_type === "preferred")
          .map((skill) => ({ name: skill.name, normalized_name: skill.normalized_name })),
      },
      profileSourceHash: profileSourceHash({
        profile: profile.profile,
        skills: profile.skills,
        experiences: profile.experiences,
        projects: profile.projects,
        educations: profile.educations,
      }),
      applicationSourceHash: applicationSourceHash({
        company: application.application.company,
        job_title: application.application.job_title,
        location: application.application.location,
        work_arrangement: application.application.work_arrangement,
        responsibilities: application.application.responsibilities ?? [],
        qualifications: application.application.qualifications ?? [],
        requiredSkills: application.skills
          .filter((skill) => skill.requirement_type === "required")
          .map((skill) => ({ normalized_name: skill.normalized_name })),
        preferredSkills: application.skills
          .filter((skill) => skill.requirement_type === "preferred")
          .map((skill) => ({ normalized_name: skill.normalized_name })),
      }),
    };
  }

  async function createRun(
    userId: string,
    applicationId: string,
    operation: "match_analysis" | "cover_letter" | "interview_prep",
    idempotencyKey: string,
    mode: "demo",
  ): Promise<{ id: string; status: string }> {
    const { data, error } = await supabase.rpc("create_ai_run", {
      p_user_id: userId,
      p_application_id: applicationId,
      p_operation: operation,
      p_idempotency_key: idempotencyKey,
      p_generation_mode: mode,
    });
    if (error) {
      throw new AppError(
        "database_unavailable",
        "Could not start the AI request. Please try again.",
        error,
      );
    }
    const row = (data as Array<{ id: string; status: string }> | null)?.[0];
    if (!row) throw new AppError("unexpected", "Could not start the AI request.");
    return row;
  }

  async function completeRun(
    userId: string,
    runId: string,
    status: "succeeded" | "failed",
    safeError: string | null,
  ) {
    const { error } = await supabase.rpc("complete_ai_run", {
      p_user_id: userId,
      p_run_id: runId,
      p_status: status,
      p_safe_error: safeError,
    });
    if (error) {
      throw new AppError("database_unavailable", "Could not finalize the AI request.", error);
    }
  }

  async function loadCurrentHashes(userId: string, applicationId: string) {
    const [application, profile] = await Promise.all([
      loadApplicationData(userId, applicationId),
      loadProfileData(userId),
    ]);
    return {
      profileHash: profileSourceHash({
        profile: profile.profile,
        skills: profile.skills,
        experiences: profile.experiences,
        projects: profile.projects,
        educations: profile.educations,
      }),
      applicationHash: applicationSourceHash({
        company: application.application.company,
        job_title: application.application.job_title,
        location: application.application.location,
        work_arrangement: application.application.work_arrangement,
        responsibilities: application.application.responsibilities ?? [],
        qualifications: application.application.qualifications ?? [],
        requiredSkills: application.skills
          .filter((skill) => skill.requirement_type === "required")
          .map((skill) => ({ normalized_name: skill.normalized_name })),
        preferredSkills: application.skills
          .filter((skill) => skill.requirement_type === "preferred")
          .map((skill) => ({ normalized_name: skill.normalized_name })),
      }),
    };
  }

  return {
    async getAIBundle(userId: string, applicationId: string) {
      const [match, documents, hashes] = await Promise.all([
        supabase
          .from("match_analyses")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("generated_documents")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("version", { ascending: true })
          .limit(LIST_LIMIT),
        loadCurrentHashes(userId, applicationId),
      ]);

      const error = match.error ?? documents.error;
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load AI content. Please try again.",
          error,
        );
      }

      const latestMatch = match.data ?? null;
      const stale =
        latestMatch != null &&
        (latestMatch.profile_source_hash !== hashes.profileHash ||
          latestMatch.application_source_hash !== hashes.applicationHash);

      const byType = new Map<string, typeof documents.data>();
      for (const document of documents.data ?? []) {
        const list = byType.get(document.document_type) ?? [];
        list.push(document);
        byType.set(document.document_type, list);
      }
      const latestOf = (type: string) => {
        const list = byType.get(type) ?? [];
        return list.length > 0 ? list[list.length - 1] : null;
      };

      return {
        match: latestMatch,
        matchStale: stale,
        coverLetter: latestOf("cover_letter"),
        coverLetterVersions: byType.get("cover_letter") ?? [],
        behaviouralQuestions: latestOf("behavioural_questions"),
        technicalQuestions: latestOf("technical_questions"),
        researchChecklist: latestOf("research_checklist"),
      };
    },

    async generateMatchAnalysis(userId: string, applicationId: string, idempotencyKey: string) {
      const run = await createRun(userId, applicationId, "match_analysis", idempotencyKey, "demo");
      if (run.status === "succeeded") {
        const { data } = await supabase
          .from("match_analyses")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .single();
        return data;
      }

      try {
        const [application, profile] = await Promise.all([
          loadApplicationData(userId, applicationId),
          loadProfileData(userId),
        ]);
        const input = toMatchInput(userId, application, profile);
        const provider = await getAIProvider();
        const result = await withProviderTimeout(provider.analyzeMatch(input));
        const validated = matchAnalysisResultSchema.safeParse(result);
        if (!validated.success) {
          throw new AppError(
            "ai_unavailable",
            "The analysis returned an invalid result. Please try again.",
          );
        }
        const { error } = await supabase.rpc("insert_match_analysis", {
          p_user_id: userId,
          p_application_id: applicationId,
          p_run_id: run.id,
          p_analysis: validated.data,
          p_mode: "demo",
        });
        if (error) {
          throw new AppError(
            "database_unavailable",
            "Could not save the analysis. Please try again.",
            error,
          );
        }
        return validated.data;
      } catch (error) {
        await completeRun(userId, run.id, "failed", safeErrorOf(error));
        throw error;
      }
    },

    async generateCoverLetter(userId: string, applicationId: string, idempotencyKey: string) {
      const run = await createRun(userId, applicationId, "cover_letter", idempotencyKey, "demo");
      if (run.status === "succeeded") {
        return this.getLatestDocument(userId, applicationId, "cover_letter");
      }

      try {
        const [application, profile] = await Promise.all([
          loadApplicationData(userId, applicationId),
          loadProfileData(userId),
        ]);
        const input: CoverLetterInput = {
          profile: {
            preferredName: profile.profile?.preferred_name ?? null,
            location: profile.profile?.location ?? null,
            experiences: profile.experiences.map((experience) => ({
              id: experience.id,
              title: experience.title,
              organization: experience.organization,
              bullet_points: experience.bullet_points ?? [],
            })),
            projects: profile.projects.map((project) => ({
              id: project.id,
              name: project.name,
              technologies: project.technologies ?? [],
              description: project.description,
            })),
            educations: profile.educations.map((education) => ({
              id: education.id,
              school: education.school,
              degree: education.degree,
              program: education.program,
            })),
          },
          application: {
            company: application.application.company,
            job_title: application.application.job_title,
            responsibilities: application.application.responsibilities ?? [],
            qualifications: application.application.qualifications ?? [],
          },
        };
        const provider = await getAIProvider();
        const result = await withProviderTimeout(provider.generateCoverLetter(input));
        const validated = coverLetterResultSchema.safeParse(result);
        if (!validated.success) {
          throw new AppError("ai_unavailable", "The cover letter was invalid. Please try again.");
        }
        if (!validated.data.sufficient) {
          throw new AppError(
            "validation",
            validated.data.prompt ?? "Complete your profile to generate a cover letter.",
          );
        }

        const { error } = await supabase.rpc("insert_generated_document", {
          p_user_id: userId,
          p_application_id: applicationId,
          p_document_type: "cover_letter",
          p_content_text: validated.data.content ?? null,
          p_content_json: null,
          p_mode: "demo",
          p_user_edited: false,
          p_run_id: run.id,
        });
        if (error) {
          throw new AppError(
            "database_unavailable",
            "Could not save the cover letter. Please try again.",
            error,
          );
        }
        return validated.data;
      } catch (error) {
        await completeRun(userId, run.id, "failed", safeErrorOf(error));
        throw error;
      }
    },

    async generateInterviewPrep(userId: string, applicationId: string, idempotencyKey: string) {
      const run = await createRun(userId, applicationId, "interview_prep", idempotencyKey, "demo");
      if (run.status === "succeeded") {
        return this.getLatestDocument(userId, applicationId, "interview_prep");
      }

      try {
        const [application, profile] = await Promise.all([
          loadApplicationData(userId, applicationId),
          loadProfileData(userId),
        ]);
        const input: InterviewPrepInput = {
          profileSkills: profile.skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            normalized_name: skill.normalized_name,
          })),
          experiences: profile.experiences.map((experience) => ({
            id: experience.id,
            title: experience.title,
            organization: experience.organization,
            bullet_points: experience.bullet_points ?? [],
          })),
          projects: profile.projects.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
          })),
          application: {
            company: application.application.company,
            job_title: application.application.job_title,
            requiredSkills: application.skills
              .filter((skill) => skill.requirement_type === "required")
              .map((skill) => ({ name: skill.name, normalized_name: skill.normalized_name })),
            preferredSkills: application.skills
              .filter((skill) => skill.requirement_type === "preferred")
              .map((skill) => ({ name: skill.name, normalized_name: skill.normalized_name })),
          },
        };
        const provider = await getAIProvider();
        const result = await withProviderTimeout(provider.generateInterviewPrep(input));
        const validated = interviewPrepResultSchema.safeParse(result);
        if (!validated.success) {
          throw new AppError(
            "ai_unavailable",
            "The interview preparation was invalid. Please try again.",
          );
        }

        const parts: Array<{
          type: "behavioural_questions" | "technical_questions" | "research_checklist";
          json: unknown;
        }> = [
          {
            type: "behavioural_questions",
            json: { questions: validated.data.behavioural_questions },
          },
          {
            type: "technical_questions",
            json: { questions: validated.data.technical_questions },
          },
          {
            type: "research_checklist",
            json: { items: validated.data.research_checklist },
          },
        ];

        for (const part of parts) {
          const { error } = await supabase.rpc("insert_generated_document", {
            p_user_id: userId,
            p_application_id: applicationId,
            p_document_type: part.type,
            p_content_text: null,
            p_content_json: part.json,
            p_mode: "demo",
            p_user_edited: false,
            p_run_id: run.id,
          });
          if (error) {
            throw new AppError(
              "database_unavailable",
              "Could not save the interview preparation. Please try again.",
              error,
            );
          }
        }
        return validated.data;
      } catch (error) {
        await completeRun(userId, run.id, "failed", safeErrorOf(error));
        throw error;
      }
    },

    async saveCoverLetterEdit(userId: string, applicationId: string, content: string) {
      const run = await createRun(
        userId,
        applicationId,
        "cover_letter",
        crypto.randomUUID(),
        "demo",
      );
      const { error } = await supabase.rpc("insert_generated_document", {
        p_user_id: userId,
        p_application_id: applicationId,
        p_document_type: "cover_letter",
        p_content_text: content,
        p_content_json: null,
        p_mode: "demo",
        p_user_edited: true,
        p_run_id: run.id,
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the cover letter. Please try again.",
          error,
        );
      }
    },

    async restoreCoverLetterVersion(userId: string, applicationId: string, version: number) {
      const { data: versionRow, error: readError } = await supabase
        .from("generated_documents")
        .select("content_text")
        .eq("application_id", applicationId)
        .eq("user_id", userId)
        .eq("document_type", "cover_letter")
        .eq("version", version)
        .maybeSingle();
      if (readError) {
        throw new AppError(
          "database_unavailable",
          "Could not load the previous version.",
          readError,
        );
      }
      if (!versionRow?.content_text) {
        throw new AppError("not_found", "The version was not found.");
      }
      await this.saveCoverLetterEdit(userId, applicationId, versionRow.content_text);
    },

    async getLatestDocument(
      userId: string,
      applicationId: string,
      type: "cover_letter" | "interview_prep",
    ) {
      const { data, error } = await supabase
        .from("generated_documents")
        .select("*")
        .eq("application_id", applicationId)
        .eq("user_id", userId)
        .eq("document_type", type)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new AppError("database_unavailable", "Could not load the generated content.", error);
      }
      return data;
    },
  };
}

export type AIService = ReturnType<typeof createAIService>;

function safeErrorOf(error: unknown): string {
  if (error instanceof AppError) return error.safeMessage;
  return "The AI request failed. Please try again.";
}

/** Re-exported for the existing analyzeJob action (Phase 3). */
export async function analyzeWithDemoProvider(input: {
  description: string;
  url: string | null;
}): Promise<JobExtractionResult> {
  const provider = await getAIProvider();
  const result = await withProviderTimeout(provider.extractJob(input));
  return result;
}
