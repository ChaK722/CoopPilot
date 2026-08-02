import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, FileText, GraduationCap, History, Link2 } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createApplicationService } from "@/features/applications/application-service";
import { JobDetailActions } from "@/features/applications/job-detail-actions";
import { NotesAutosave } from "@/features/applications/notes-autosave";
import { InterviewSection, type InterviewRow } from "@/features/applications/interview-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/validation/applications";

export const metadata: Metadata = {
  title: "Job Detail",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  const service = createApplicationService(await createServerSupabaseClient());

  let bundle;
  try {
    bundle = await service.getApplication(user.id, id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AppError" &&
      "kind" in error &&
      error.kind === "not_found"
    ) {
      notFound();
    }
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-medium">Could not load the application</p>
        <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
      </div>
    );
  }

  const app = bundle.application;
  const status = app.status as ApplicationStatus;
  const requiredSkills = bundle.skills.filter((skill) => skill.requirement_type === "required");
  const preferredSkills = bundle.skills.filter((skill) => skill.requirement_type === "preferred");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {app.company} — {app.job_title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status: {APPLICATION_STATUS_LABELS[status]}
            {app.archived_at ? " · Archived" : ""}
          </p>
        </div>
        <JobDetailActions applicationId={app.id} archived={app.archived_at != null} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Location" value={app.location} />
          <Info label="Country" value={app.country} />
          <Info label="Work arrangement" value={app.work_arrangement} />
          <Info label="Employment type" value={app.employment_type} />
          <Info label="Work term duration" value={app.work_term_duration} />
          <Info label="Deadline" value={formatDate(app.deadline)} />
          <Info label="Date applied" value={formatDate(app.date_applied)} />
          <Info label="Salary" value={app.salary_text} />
          <Info label="Years of experience" value={app.years_of_experience} />
          <Info label="Contact person" value={app.contact_person} />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Posting URL
            </span>
            {app.posting_url ? (
              <a
                href={app.posting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-primary hover:underline"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {app.posting_url}
              </a>
            ) : (
              <span>Not set</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
            Requirements
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Education requirements
            </p>
            {app.education_requirements.length > 0 ? (
              <ul className="list-inside list-disc">
                {(app.education_requirements as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None listed</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Qualifications
            </p>
            {app.qualifications.length > 0 ? (
              <ul className="list-inside list-disc">
                {(app.qualifications as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None listed</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Required skills
            </p>
            <Chips skills={requiredSkills.map((skill) => skill.name)} empty="None added" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preferred skills
            </p>
            <Chips skills={preferredSkills.map((skill) => skill.name)} empty="None added" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            Original description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-sans text-sm">{app.original_description}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Notes autosave as you type.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotesAutosave applicationId={app.id} initialNotes={app.notes ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            Interview dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InterviewSection applicationId={app.id} initial={bundle.interviews as InterviewRow[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            Status history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {bundle.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">
                  {event.from_status
                    ? `${APPLICATION_STATUS_LABELS[event.from_status as ApplicationStatus]} → ${APPLICATION_STATUS_LABELS[event.to_status as ApplicationStatus]}`
                    : `Created as ${APPLICATION_STATUS_LABELS[event.to_status as ApplicationStatus]}`}
                </span>
                <time dateTime={event.changed_at} className="text-xs text-muted-foreground">
                  {new Date(event.changed_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span>{value ?? "Not set"}</span>
    </div>
  );
}

function Chips({ skills, empty }: { skills: string[]; empty: string }) {
  if (skills.length === 0) {
    return <p className="text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((skill) => (
        <li key={skill} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
          {skill}
        </li>
      ))}
    </ul>
  );
}
