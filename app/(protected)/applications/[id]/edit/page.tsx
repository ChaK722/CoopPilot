import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createApplicationService } from "@/features/applications/application-service";
import { ReviewForm, type ReviewInitial } from "@/features/applications/review-form";
import type { ApplicationValues } from "@/lib/validation/applications";

export const metadata: Metadata = {
  title: "Edit Application",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function toValues(app: Record<string, unknown>): ApplicationValues {
  return {
    company: String(app.company ?? ""),
    job_title: String(app.job_title ?? ""),
    location: (app.location as string | null) ?? "",
    country: (app.country as string | null) ?? "",
    work_arrangement: (app.work_arrangement as string | null) ?? "",
    employment_type: (app.employment_type as string | null) ?? "",
    work_term_duration: (app.work_term_duration as string | null) ?? "",
    deadline: (app.deadline as string | null) ?? "",
    salary_text: (app.salary_text as string | null) ?? "",
    education_requirements: (app.education_requirements as string[]) ?? [],
    years_of_experience: (app.years_of_experience as string | null) ?? "",
    posting_url: (app.posting_url as string | null) ?? "",
    original_description: String(app.original_description ?? ""),
    responsibilities: (app.responsibilities as string[]) ?? [],
    qualifications: (app.qualifications as string[]) ?? [],
  };
}

export default async function EditApplicationPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  const service = createApplicationService(await createServerSupabaseClient());

  let bundle;
  try {
    bundle = await service.getApplication(user.id, id);
  } catch (error) {
    if (error instanceof Error && "kind" in error && error.kind === "not_found") {
      notFound();
    }
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-medium">Could not load the application</p>
        <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
      </div>
    );
  }

  const initial: ReviewInitial = {
    values: toValues(bundle.application),
    skills: bundle.skills.map(
      (skill: { requirement_type: "required" | "preferred"; name: string }) => ({
        requirement_type: skill.requirement_type,
        name: skill.name,
      }),
    ),
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Edit application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the job details for {bundle.application.company} — {bundle.application.job_title}.
        </p>
      </header>
      <ReviewForm initial={initial} applicationId={id} />
    </div>
  );
}
