import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import {
  createApplicationService,
  type ApplicationListFilters,
} from "@/features/applications/application-service";
import { FiltersBar } from "@/features/applications/filters-bar";
import { ApplicationsTable, type ApplicationRow } from "@/features/applications/applications-table";
import type { ApplicationStatus } from "@/lib/validation/applications";

export const metadata: Metadata = {
  title: "Applications",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const statuses = first(params.status)
    .split(",")
    .filter((status): status is ApplicationStatus =>
      ["saved", "preparing", "applied", "interview", "offer", "rejected", "withdrawn"].includes(
        status,
      ),
    );
  const sortBy = first(params.sort);
  const allowedSorts = [
    "company",
    "job_title",
    "location",
    "deadline",
    "date_applied",
    "status",
    "updated_at",
    "created_at",
  ];

  const filters: ApplicationListFilters = {
    search: first(params.search),
    statuses: statuses.length > 0 ? statuses : undefined,
    company: first(params.company),
    location: first(params.location),
    workArrangement: first(params.arrangement),
    requiredSkill: first(params.skill),
    deadlineFrom: first(params.deadlineFrom),
    deadlineTo: first(params.deadlineTo),
    archive: (first(params.archive) as "active" | "archived" | "all") || "active",
    sortBy: (allowedSorts.includes(sortBy)
      ? sortBy
      : "updated_at") as ApplicationListFilters["sortBy"],
    sortAscending: first(params.dir) === "asc",
  };

  const service = createApplicationService(await createServerSupabaseClient());
  let rows: ApplicationRow[];
  try {
    rows = (await service.listApplications(user.id, filters)) as ApplicationRow[];
  } catch {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load your applications</p>
            <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search, filter, and sort your saved applications.
          </p>
        </div>
      </header>
      <FiltersBar />
      <ApplicationsTable rows={rows} />
    </div>
  );
}
