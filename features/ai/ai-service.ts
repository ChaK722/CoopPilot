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
import { jobExtractionResultSchema } from "@/features/ai/extraction-schema";

const LIST_LIMIT = 100;

type DbClient = SupabaseClient;

type RunOperation = "job_extraction" | "match_analysis" | "cover_letter" | "interview_prep";

interface RunInfo {
  id: string | null;
  status: string;
  created: boolean;
  safe_error_message: string | null;
}

function notFound(): AppError {
  return new AppError("not_found", "The application was not found or is not yours.");
}

function inProgress(): AppError {
  return new AppError(
    "conflict",
    "A request with the same key is already in progress. Please wait.",
  );
}

function idempotencyConflict(): AppError {
  return new AppError(
    "conflict",
    "The request key conflicts with a different request. Please try again.",
  );
}

function consistencyError(message: string): AppError {
  return new AppError("unexpected", message);
}

function requireRunId(run: RunInfo): string {
  if (run.id === null) {
    throw new AppError("unexpected", "The AI request is in an unexpected state.");
  }
  return run.id;
}

function rpcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

function mapRpcError(error: unknown, fallbackMessage: string): AppError {
  const message = rpcErrorMessage(error);
  if (/idempotency key conflicts/i.test(message)) {
    return idempotencyConflict();
  }
  if (/inconsistent succeeded run/i.test(message)) {
    return consistencyError("The saved AI result is missing or inconsistent. Please try again.");
  }
  return new AppError("database_unavailable", fallbackMessage, error);
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
    return profileService.getProfileBundle(userId);
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
    applicationId: string | null,
    operation: RunOperation,
    idempotencyKey: string,
    mode: "demo",
  ): Promise<RunInfo> {
    const { data, error } = await supabase.rpc("create_ai_run", {
      p_user_id: userId,
      p_application_id: applicationId,
      p_operation: operation,
      p_idempotency_key: idempotencyKey,
      p_generation_mode: mode,
    });
    if (error) {
      throw mapRpcError(error, "Could not start the AI request. Please try again.");
    }
    const row = (data as RunInfo[] | null)?.[0];
    if (!row) throw new AppError("unexpected", "Could not start the AI request.");
    if (row.status === "not_found") throw notFound();
    if (row.status === "idempotency_conflict") throw idempotencyConflict();
    return row;
  }

  async function completeRunFailed(userId: string, runId: string, safeError: string) {
    const { error } = await supabase.rpc("complete_ai_run", {
      p_user_id: userId,
      p_run_id: runId,
      p_status: "failed",
      p_safe_error: safeError,
    });
    if (error) {
      // Never mask the original business error.
      return;
    }
  }

  async function readMatchByRun(userId: string, runId: string) {
    const { data, error } = await supabase
      .from("match_analyses")
      .select("*")
      .eq("ai_run_id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new AppError("database_unavailable", "Could not load the analysis.", error);
    }
    return data;
  }

  async function readDocumentByRun(userId: string, runId: string, documentType: string) {
    const { data, error } = await supabase
      .from("generated_documents")
      .select("*")
      .eq("ai_run_id", runId)
      .eq("user_id", userId)
      .eq("document_type", documentType)
      .maybeSingle();
    if (error) {
      throw new AppError("database_unavailable", "Could not load the generated content.", error);
    }
    return data;
  }

  async function readExtractionByRun(userId: string, runId: string) {
    const { data, error } = await supabase
      .from("ai_runs")
      .select("result_json")
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new AppError("database_unavailable", "Could not load the analysis.", error);
    }
    if (!data?.result_json) {
      throw consistencyError("The saved analysis is missing or inconsistent. Please try again.");
    }
    const parsed = jobExtractionResultSchema.safeParse(data.result_json);
    if (!parsed.success) {
      throw new AppError("ai_unavailable", "The stored analysis is invalid. Please analyze again.");
    }
    return parsed.data;
  }

  function ensureCreated(run: RunInfo) {
    if (run.created) return;
    if (run.status === "not_found") throw notFound();
    if (run.status === "running") throw inProgress();
    if (run.status === "failed") {
      throw new AppError(
        "ai_unavailable",
        run.safe_error_message ?? "The AI request previously failed. Please try again.",
      );
    }
    if (run.status !== "succeeded") {
      throw new AppError("ai_unavailable", "The AI request is in an unexpected state.");
    }
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
        (async () => {
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
        })(),
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
      if (!run.created) {
        ensureCreated(run);
        const runId = requireRunId(run);
        const existing = await readMatchByRun(userId, runId);
        if (!existing) {
          throw consistencyError(
            "The saved analysis is missing or inconsistent. Please try again.",
          );
        }
        return existing;
      }

      const runId = requireRunId(run);
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
          p_run_id: runId,
          p_analysis: validated.data,
          p_mode: "demo",
        });
        if (error) {
          throw mapRpcError(error, "Could not save the analysis. Please try again.");
        }
        const saved = await readMatchByRun(userId, runId);
        return saved;
      } catch (error) {
        if (error instanceof AppError) {
          await completeRunFailed(userId, runId, error.safeMessage);
        } else {
          await completeRunFailed(userId, runId, "The AI request failed. Please try again.");
        }
        throw error;
      }
    },

    async generateCoverLetter(userId: string, applicationId: string, idempotencyKey: string) {
      const run = await createRun(userId, applicationId, "cover_letter", idempotencyKey, "demo");
      if (!run.created) {
        ensureCreated(run);
        const runId = requireRunId(run);
        const existing = await readDocumentByRun(userId, runId, "cover_letter");
        if (!existing) {
          throw consistencyError(
            "The saved cover letter is missing or inconsistent. Please try again.",
          );
        }
        return existing;
      }

      const runId = requireRunId(run);
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

        const { error } = await supabase.rpc("insert_cover_letter_generation", {
          p_user_id: userId,
          p_application_id: applicationId,
          p_run_id: runId,
          p_content: validated.data.content ?? "",
          p_mode: "demo",
        });
        if (error) {
          throw mapRpcError(error, "Could not save the cover letter. Please try again.");
        }
        const saved = await readDocumentByRun(userId, runId, "cover_letter");
        return saved;
      } catch (error) {
        if (error instanceof AppError) {
          await completeRunFailed(userId, runId, error.safeMessage);
        } else {
          await completeRunFailed(userId, runId, "The AI request failed. Please try again.");
        }
        throw error;
      }
    },

    async generateInterviewPrep(userId: string, applicationId: string, idempotencyKey: string) {
      const run = await createRun(userId, applicationId, "interview_prep", idempotencyKey, "demo");
      if (!run.created) {
        ensureCreated(run);
        const runId = requireRunId(run);
        const [behavioural, technical, research] = await Promise.all([
          readDocumentByRun(userId, runId, "behavioural_questions"),
          readDocumentByRun(userId, runId, "technical_questions"),
          readDocumentByRun(userId, runId, "research_checklist"),
        ]);
        if (!behavioural || !technical || !research) {
          throw consistencyError(
            "The saved interview preparation is incomplete or inconsistent. Please try again.",
          );
        }
        return { behavioural, technical, research };
      }

      const runId = requireRunId(run);
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

        // One atomic bundle RPC writes all three parts in a single transaction.
        const { error } = await supabase.rpc("insert_interview_prep_bundle", {
          p_user_id: userId,
          p_application_id: applicationId,
          p_run_id: runId,
          p_mode: "demo",
          p_behavioural: { questions: validated.data.behavioural_questions },
          p_technical: { questions: validated.data.technical_questions },
          p_research: { items: validated.data.research_checklist },
        });
        if (error) {
          throw mapRpcError(error, "Could not save the interview preparation. Please try again.");
        }
        const [behavioural, technical, research] = await Promise.all([
          readDocumentByRun(userId, runId, "behavioural_questions"),
          readDocumentByRun(userId, runId, "technical_questions"),
          readDocumentByRun(userId, runId, "research_checklist"),
        ]);
        return { behavioural, technical, research };
      } catch (error) {
        if (error instanceof AppError) {
          await completeRunFailed(userId, runId, error.safeMessage);
        } else {
          await completeRunFailed(userId, runId, "The AI request failed. Please try again.");
        }
        throw error;
      }
    },

    async saveCoverLetterEdit(userId: string, applicationId: string, content: string) {
      const { error } = await supabase.rpc("insert_cover_letter_revision", {
        p_user_id: userId,
        p_application_id: applicationId,
        p_content: content,
        p_revision_source: "edited",
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
      const { error } = await supabase.rpc("insert_cover_letter_revision", {
        p_user_id: userId,
        p_application_id: applicationId,
        p_content: versionRow.content_text,
        p_revision_source: "restored",
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not restore the version. Please try again.",
          error,
        );
      }
    },

    /**
     * Job extraction with the unified ai_runs lifecycle. The Analyze flow
     * generates a fresh idempotency key per click; succeeded retries read the
     * stored result, running keys return "in progress", failed keys return
     * the safe failure message without re-running the provider.
     */
    async analyzeJob(
      userId: string,
      input: { description: string; url: string | null },
      idempotencyKey: string,
    ) {
      const run = await createRun(userId, null, "job_extraction", idempotencyKey, "demo");
      if (!run.created) {
        ensureCreated(run);
        return readExtractionByRun(userId, requireRunId(run));
      }

      const runId = requireRunId(run);
      try {
        const provider = await getAIProvider();
        const result = await withProviderTimeout(
          provider.extractJob({ description: input.description, url: input.url }),
        );
        const validated = jobExtractionResultSchema.safeParse(result);
        if (!validated.success) {
          throw new AppError(
            "ai_unavailable",
            "The analysis returned an invalid result. Please try again.",
          );
        }
        const { error } = await supabase.rpc("save_job_extraction_result", {
          p_user_id: userId,
          p_run_id: runId,
          p_result: validated.data,
        });
        if (error) {
          throw mapRpcError(error, "Could not save the analysis. Please try again.");
        }
        return validated.data;
      } catch (error) {
        if (error instanceof AppError) {
          await completeRunFailed(userId, runId, error.safeMessage);
        } else {
          await completeRunFailed(userId, runId, "The AI request failed. Please try again.");
        }
        throw error;
      }
    },
  };
}

export type AIService = ReturnType<typeof createAIService>;
