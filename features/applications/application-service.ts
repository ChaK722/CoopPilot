import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { normalizeSkillName } from "@/lib/validation/shared";
import type {
  ApplicationStatus,
  ApplicationValues,
  CreateApplicationInput,
  InterviewValues,
} from "@/lib/validation/applications";
import type { BoardApplication } from "@/features/applications/board";

const LIST_LIMIT = 200;

type DbClient = SupabaseClient;

function notFound(resource = "application"): AppError {
  return new AppError("not_found", `The ${resource} was not found or is not yours.`);
}

export type ApplicationSortField =
  | "company"
  | "job_title"
  | "location"
  | "deadline"
  | "date_applied"
  | "status"
  | "updated_at"
  | "created_at";

export interface ApplicationListFilters {
  search?: string;
  statuses?: ApplicationStatus[];
  company?: string;
  location?: string;
  workArrangement?: string;
  requiredSkill?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  archive?: "active" | "archived" | "all";
  sortBy?: ApplicationSortField;
  sortAscending?: boolean;
}

export function createApplicationService(supabase: DbClient) {
  return {
    async getApplication(userId: string, applicationId: string) {
      const [application, skills, events, interviews] = await Promise.all([
        supabase
          .from("applications")
          .select("*")
          .eq("id", applicationId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("application_skills")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from("application_status_events")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("changed_at", { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from("interviews")
          .select("*")
          .eq("application_id", applicationId)
          .eq("user_id", userId)
          .order("scheduled_at", { ascending: true })
          .limit(LIST_LIMIT),
      ]);

      const error = application.error ?? skills.error ?? events.error ?? interviews.error;
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load the application. Please try again.",
          error,
        );
      }
      if (!application.data) {
        throw notFound();
      }
      return {
        application: application.data,
        skills: skills.data ?? [],
        events: events.data ?? [],
        interviews: interviews.data ?? [],
      };
    },

    async listApplications(userId: string, filters: ApplicationListFilters = {}) {
      let query = supabase.from("applications").select("*").eq("user_id", userId).limit(LIST_LIMIT);

      const { search, statuses, company, location, workArrangement, requiredSkill } = filters;

      if (search?.trim()) {
        const term = search.trim();
        const { data: skillRows } = await supabase
          .from("application_skills")
          .select("application_id")
          .eq("user_id", userId)
          .or(`name.ilike.%${escapeLike(term)}%,normalized_name.ilike.%${escapeLike(term)}%`)
          .limit(LIST_LIMIT);
        const skillIds = (skillRows ?? []).map((row) => row.application_id);
        const clauses = [
          `company.ilike.%${escapeLike(term)}%`,
          `job_title.ilike.%${escapeLike(term)}%`,
          `notes.ilike.%${escapeLike(term)}%`,
        ];
        if (skillIds.length > 0) {
          clauses.push(`id.in.(${skillIds.join(",")})`);
        }
        query = query.or(clauses.join(","));
      }

      if (statuses && statuses.length > 0) {
        query = query.in("status", statuses);
      }
      if (company?.trim()) {
        query = query.ilike("company", `%${escapeLike(company.trim())}%`);
      }
      if (location?.trim()) {
        query = query.ilike("location", `%${escapeLike(location.trim())}%`);
      }
      if (workArrangement?.trim()) {
        query = query.ilike("work_arrangement", `%${escapeLike(workArrangement.trim())}%`);
      }
      if (requiredSkill?.trim()) {
        const term = requiredSkill.trim();
        const { data: skillRows } = await supabase
          .from("application_skills")
          .select("application_id")
          .eq("user_id", userId)
          .eq("requirement_type", "required")
          .or(`name.ilike.%${escapeLike(term)}%,normalized_name.ilike.%${escapeLike(term)}%`)
          .limit(LIST_LIMIT);
        const ids = (skillRows ?? []).map((row) => row.application_id);
        query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
      }
      if (filters.deadlineFrom) {
        query = query.gte("deadline", filters.deadlineFrom);
      }
      if (filters.deadlineTo) {
        query = query.lte("deadline", filters.deadlineTo);
      }
      if ((filters.archive ?? "active") === "active") {
        query = query.is("archived_at", null);
      } else if (filters.archive === "archived") {
        query = query.not("archived_at", "is", null);
      }

      const sortBy = filters.sortBy ?? "updated_at";
      query = query.order(sortBy, { ascending: filters.sortAscending ?? false });

      const { data, error } = await query;
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your applications. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    /** Non-archived applications for the board, in stable column order. */
    async listBoardApplications(userId: string) {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your board. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    /**
     * Board rows plus their latest match score. Exactly two bounded reads:
     * the application rows and one batch RPC that returns the latest
     * match_analyses score per non-archived application - never a per-card
     * query.
     */
    async listBoardWithScores(userId: string): Promise<BoardApplication[]> {
      const [rowsResult, scoresResult] = await Promise.all([
        supabase
          .from("applications")
          .select("*")
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(LIST_LIMIT),
        supabase.rpc("get_board_match_scores", { p_user_id: userId }),
      ]);
      if (rowsResult.error || scoresResult.error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your board. Please try again.",
          rowsResult.error ?? scoresResult.error,
        );
      }
      const scores = new Map<string, number>(
        (scoresResult.data ?? []).map((row: { application_id: string; overall_score: number }) => [
          row.application_id as string,
          row.overall_score as number,
        ]),
      );
      return (rowsResult.data ?? []).map((row) => ({
        ...row,
        latest_match_score: scores.get(row.id as string) ?? null,
      }));
    },

    /** Archived applications for the Archive page (newest archive first). */
    async listArchivedApplications(userId: string) {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your archived applications. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    async updateStatus(
      userId: string,
      applicationId: string,
      toStatus: ApplicationStatus,
      dateApplied: string | null,
    ) {
      const { data, error } = await supabase.rpc("update_application_status", {
        p_user_id: userId,
        p_application_id: applicationId,
        p_to_status: toStatus,
        p_date_applied: dateApplied,
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not update the application status. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
      return data as string;
    },

    async archiveApplication(userId: string, applicationId: string) {
      const { data, error } = await supabase
        .from("applications")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not archive the application. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
    },

    async restoreApplication(userId: string, applicationId: string) {
      const { data, error } = await supabase
        .from("applications")
        .update({ archived_at: null })
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not restore the application. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
    },

    async createApplication(userId: string, input: CreateApplicationInput) {
      const skills = (input.skills ?? []).map((skill, index) => ({
        requirement_type: skill.requirement_type,
        name: skill.name.trim(),
        normalized_name: normalizeSkillName(skill.name),
        sort_order: index,
      }));
      const { data, error } = await supabase.rpc("create_application", {
        p_user_id: userId,
        p_creation_key: input.creation_key,
        p_company: input.company,
        p_job_title: input.job_title,
        p_location: input.location,
        p_country: input.country,
        p_work_arrangement: input.work_arrangement,
        p_employment_type: input.employment_type,
        p_work_term_duration: input.work_term_duration,
        p_deadline: input.deadline,
        p_salary_text: input.salary_text,
        p_education_requirements: input.education_requirements,
        p_years_of_experience: input.years_of_experience,
        p_posting_url: input.posting_url,
        p_original_description: input.original_description,
        p_responsibilities: input.responsibilities,
        p_qualifications: input.qualifications,
        p_skills: skills,
        p_initial_status: "saved",
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the application. Please try again.",
          error,
        );
      }
      return data as string;
    },

    async updateApplication(userId: string, applicationId: string, input: ApplicationValues) {
      const { data, error } = await supabase
        .from("applications")
        .update({
          company: input.company,
          job_title: input.job_title,
          location: input.location,
          country: input.country,
          work_arrangement: input.work_arrangement,
          employment_type: input.employment_type,
          work_term_duration: input.work_term_duration,
          deadline: input.deadline,
          salary_text: input.salary_text,
          education_requirements: input.education_requirements,
          years_of_experience: input.years_of_experience,
          posting_url: input.posting_url,
          original_description: input.original_description,
          responsibilities: input.responsibilities,
          qualifications: input.qualifications,
        })
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the application. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
    },

    async deleteApplication(userId: string, applicationId: string) {
      const { data, error } = await supabase
        .from("applications")
        .delete()
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("id");
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not delete the application. Please try again.",
          error,
        );
      }
      if (!data || data.length === 0) throw notFound();
    },

    async duplicateApplication(userId: string, applicationId: string) {
      const { data, error } = await supabase.rpc("duplicate_application", {
        p_user_id: userId,
        p_application_id: applicationId,
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not duplicate the application. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
      return data as string;
    },

    async saveNotes(userId: string, applicationId: string, notes: string) {
      const { data, error } = await supabase
        .from("applications")
        .update({ notes })
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save your notes. Please try again.",
          error,
        );
      }
      if (!data) throw notFound();
    },

    async createInterview(userId: string, applicationId: string, input: InterviewValues) {
      const { data: app } = await supabase
        .from("applications")
        .select("id")
        .eq("id", applicationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!app) throw notFound();

      const { data, error } = await supabase
        .from("interviews")
        .insert({
          user_id: userId,
          application_id: applicationId,
          interview_type: input.interview_type,
          scheduled_at: input.scheduled_at,
          location_or_link: input.location_or_link,
          notes: input.notes,
        })
        .select()
        .single();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not add the interview. Please try again.",
          error,
        );
      }
      return data;
    },

    async deleteInterview(userId: string, interviewId: string) {
      const { data, error } = await supabase
        .from("interviews")
        .delete()
        .eq("id", interviewId)
        .eq("user_id", userId)
        .select("id, application_id");
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not delete the interview. Please try again.",
          error,
        );
      }
      if (!data || data.length === 0) throw notFound("interview");
      return data[0] as { id: string; application_id: string };
    },
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}
