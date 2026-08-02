import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createProfileService } from "@/features/profile/profile-service";
import { BasicInfoForm, type BasicProfileRow } from "@/features/profile/basic-info-form";
import { EducationEditor, type EducationRow } from "@/features/profile/education-editor";
import { SkillsEditor, type SkillRow } from "@/features/profile/skills-editor";
import { ExperienceEditor, type ExperienceRow } from "@/features/profile/experience-editor";
import { ProjectEditor, type ProjectRow } from "@/features/profile/project-editor";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const user = await requireUser();
  const service = createProfileService(await createServerSupabaseClient());

  let bundle;
  try {
    bundle = await service.getProfileBundle(user.id);
  } catch {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load your profile</p>
            <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const basicRow: BasicProfileRow = bundle.profile ?? {
    preferred_name: null,
    phone: null,
    location: null,
    linkedin_url: null,
    github_url: null,
    website_url: null,
    preferred_locations: [],
    remote_preference: null,
    preferred_work_term_lengths: [],
    target_roles: [],
    available_start_date: null,
    onboarding_completed_at: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your basic information, job preferences, education, skills, experience, and
          projects. Everything except your preferred name is optional.
        </p>
      </header>
      <BasicInfoForm initial={basicRow} mode="profile" />
      <EducationEditor initial={bundle.educations as EducationRow[]} />
      <SkillsEditor initial={bundle.skills as SkillRow[]} />
      <ExperienceEditor initial={bundle.experiences as ExperienceRow[]} />
      <ProjectEditor initial={bundle.projects as ProjectRow[]} />
    </div>
  );
}
