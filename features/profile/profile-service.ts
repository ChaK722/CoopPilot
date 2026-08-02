import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import {
  normalizeSkillName,
  type EducationValues,
  type ExperienceValues,
  type ProfileBasicValues,
  type ProjectValues,
  type SkillInput,
} from "@/lib/validation/profile";

const LIST_LIMIT = 200;

type DbClient = SupabaseClient;

function notFound(resource: string): AppError {
  return new AppError("not_found", `The ${resource} was not found or is not yours.`);
}

/**
 * Profile domain service. Every read and mutation is scoped by the current
 * user id; records that do not belong to the user are treated as not found.
 */
export function createProfileService(supabase: DbClient) {
  return {
    async getProfileBundle(userId: string) {
      const [profile, educations, skills, experiences, projects] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("educations")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from("profile_skills")
          .select("*")
          .eq("user_id", userId)
          .order("category", { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from("experiences")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from("projects")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .limit(LIST_LIMIT),
      ]);

      const error =
        profile.error ?? educations.error ?? skills.error ?? experiences.error ?? projects.error;
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your profile. Please try again.",
          error,
        );
      }

      return {
        profile: profile.data,
        educations: educations.data ?? [],
        skills: skills.data ?? [],
        experiences: experiences.data ?? [],
        projects: projects.data ?? [],
      };
    },

    async updateBasicInfo(userId: string, input: ProfileBasicValues) {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          preferred_name: input.preferred_name,
          phone: input.phone,
          location: input.location,
          linkedin_url: input.linkedin_url,
          github_url: input.github_url,
          website_url: input.website_url,
          preferred_locations: input.preferred_locations,
          remote_preference: input.remote_preference,
          preferred_work_term_lengths: input.preferred_work_term_lengths,
          target_roles: input.target_roles,
          available_start_date: input.available_start_date,
        })
        .eq("user_id", userId);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save your profile. Please try again.",
          error,
        );
      }
    },

    async completeOnboarding(userId: string, input: ProfileBasicValues) {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          preferred_name: input.preferred_name,
          phone: input.phone,
          location: input.location,
          linkedin_url: input.linkedin_url,
          github_url: input.github_url,
          website_url: input.website_url,
          preferred_locations: input.preferred_locations,
          remote_preference: input.remote_preference,
          preferred_work_term_lengths: input.preferred_work_term_lengths,
          target_roles: input.target_roles,
          available_start_date: input.available_start_date,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save your profile. Please try again.",
          error,
        );
      }
    },

    // --- Education ---------------------------------------------------------

    async listEducations(userId: string) {
      const { data, error } = await supabase
        .from("educations")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your education. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    async createEducation(userId: string, input: EducationValues) {
      const { data, error } = await supabase
        .from("educations")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not add the education. Please try again.",
          error,
        );
      }
      return data;
    },

    async updateEducation(userId: string, educationId: string, input: EducationValues) {
      const { data, error } = await supabase
        .from("educations")
        .update(input)
        .eq("id", educationId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the education. Please try again.",
          error,
        );
      }
      if (!data) {
        throw notFound("education");
      }
      return data;
    },

    async deleteEducation(userId: string, educationId: string) {
      const { error } = await supabase
        .from("educations")
        .delete()
        .eq("id", educationId)
        .eq("user_id", userId);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not delete the education. Please try again.",
          error,
        );
      }
    },

    async moveEducation(userId: string, educationId: string, direction: "up" | "down") {
      const items = await this.listEducations(userId);
      const index = items.findIndex((item) => item.id === educationId);
      if (index < 0) throw notFound("education");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= items.length) return;
      await this.swapSortOrder("educations", userId, items[index].id, items[swapIndex].id);
    },

    // --- Skills ------------------------------------------------------------

    async listSkills(userId: string) {
      const { data, error } = await supabase
        .from("profile_skills")
        .select("*")
        .eq("user_id", userId)
        .order("category", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your skills. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    /**
     * Replaces the user's full skill set. Deduplicates by normalized name per
     * category so adding the same skill twice creates only one record.
     */
    async replaceSkills(userId: string, skills: SkillInput[]) {
      const seen = new Set<string>();
      const rows = skills
        .map((skill) => ({
          user_id: userId,
          category: skill.category,
          name: skill.name.trim(),
          normalized_name: normalizeSkillName(skill.name),
        }))
        .filter((row) => {
          if (row.normalized_name.length === 0) return false;
          const key = `${row.category}:${row.normalized_name}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const { error } = await supabase.rpc("replace_profile_skills", {
        p_user_id: userId,
        p_skills: rows,
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save your skills. Please try again.",
          error,
        );
      }
    },

    // --- Experience --------------------------------------------------------

    async listExperiences(userId: string) {
      const { data, error } = await supabase
        .from("experiences")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your experience. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    async createExperience(userId: string, input: ExperienceValues) {
      const { data, error } = await supabase
        .from("experiences")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not add the experience. Please try again.",
          error,
        );
      }
      return data;
    },

    async updateExperience(userId: string, experienceId: string, input: ExperienceValues) {
      const { data, error } = await supabase
        .from("experiences")
        .update(input)
        .eq("id", experienceId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the experience. Please try again.",
          error,
        );
      }
      if (!data) throw notFound("experience");
      return data;
    },

    async deleteExperience(userId: string, experienceId: string) {
      const { error } = await supabase
        .from("experiences")
        .delete()
        .eq("id", experienceId)
        .eq("user_id", userId);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not delete the experience. Please try again.",
          error,
        );
      }
    },

    async moveExperience(userId: string, experienceId: string, direction: "up" | "down") {
      const items = await this.listExperiences(userId);
      const index = items.findIndex((item) => item.id === experienceId);
      if (index < 0) throw notFound("experience");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= items.length) return;
      await this.swapSortOrder("experiences", userId, items[index].id, items[swapIndex].id);
    },

    // --- Projects ----------------------------------------------------------

    async listProjects(userId: string) {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your projects. Please try again.",
          error,
        );
      }
      return data ?? [];
    },

    async createProject(userId: string, input: ProjectValues) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not add the project. Please try again.",
          error,
        );
      }
      return data;
    },

    async updateProject(userId: string, projectId: string, input: ProjectValues) {
      const { data, error } = await supabase
        .from("projects")
        .update(input)
        .eq("id", projectId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not save the project. Please try again.",
          error,
        );
      }
      if (!data) throw notFound("project");
      return data;
    },

    async deleteProject(userId: string, projectId: string) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("user_id", userId);
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not delete the project. Please try again.",
          error,
        );
      }
    },

    async moveProject(userId: string, projectId: string, direction: "up" | "down") {
      const items = await this.listProjects(userId);
      const index = items.findIndex((item) => item.id === projectId);
      if (index < 0) throw notFound("project");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= items.length) return;
      await this.swapSortOrder("projects", userId, items[index].id, items[swapIndex].id);
    },

    // --- Shared ------------------------------------------------------------

    async swapSortOrder(
      table: "educations" | "experiences" | "projects",
      userId: string,
      idA: string,
      idB: string,
    ) {
      const list = await this.listForTable(table, userId);
      const a = list.find((item) => item.id === idA);
      const b = list.find((item) => item.id === idB);
      if (!a || !b) throw notFound(table.slice(0, -1));
      const { error: errorA } = await supabase
        .from(table)
        .update({ sort_order: b.sort_order })
        .eq("id", a.id)
        .eq("user_id", userId);
      const { error: errorB } = await supabase
        .from(table)
        .update({ sort_order: a.sort_order })
        .eq("id", b.id)
        .eq("user_id", userId);
      if (errorA || errorB) {
        throw new AppError(
          "database_unavailable",
          "Could not reorder. Please try again.",
          errorA ?? errorB,
        );
      }
    },

    async listForTable(
      table: "educations" | "experiences" | "projects",
      userId: string,
    ): Promise<Array<{ id: string; sort_order: number }>> {
      const { data, error } = await supabase
        .from(table)
        .select("id, sort_order")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .limit(LIST_LIMIT);
      if (error) {
        throw new AppError("database_unavailable", "Could not reorder. Please try again.", error);
      }
      return data ?? [];
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
