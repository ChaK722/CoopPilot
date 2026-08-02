import Link from "next/link";
import { Briefcase } from "lucide-react";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/validation/applications";
import { formatDate as formatDateStable } from "@/lib/dates";

export interface ApplicationRow {
  id: string;
  company: string;
  job_title: string;
  location: string | null;
  deadline: string | null;
  date_applied: string | null;
  status: ApplicationStatus;
  updated_at: string;
  archived_at: string | null;
}

function statusClass(status: ApplicationStatus): string {
  switch (status) {
    case "saved":
      return "border-border text-muted-foreground";
    case "preparing":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";
    case "applied":
      return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";
    case "interview":
      return "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200";
    case "offer":
      return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
    case "rejected":
      return "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200";
    case "withdrawn":
      return "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return formatDateStable(value);
}

export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
        <Briefcase className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No applications match</p>
        <p className="text-sm text-muted-foreground">
          Add a job to get started, or reset your filters.
        </p>
        <Link href="/applications/new" className="text-sm font-medium text-primary hover:underline">
          Add a job
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Job title</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Deadline</th>
              <th className="px-3 py-2 font-medium">Applied</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-3 py-3">
                  <Link
                    href={`/applications/${row.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.company}
                  </Link>
                </td>
                <td className="px-3 py-3">{row.job_title}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}
                  >
                    {APPLICATION_STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{row.location ?? "—"}</td>
                <td className="px-3 py-3">{formatDate(row.deadline)}</td>
                <td className="px-3 py-3">{formatDate(row.date_applied)}</td>
                <td className="px-3 py-3 text-muted-foreground">{formatDate(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-border bg-card p-3">
            <Link
              href={`/applications/${row.id}`}
              className="font-medium text-primary hover:underline"
            >
              {row.company} — {row.job_title}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${statusClass(row.status)}`}
              >
                {APPLICATION_STATUS_LABELS[row.status]}
              </span>
              <span>{row.location ?? "No location"}</span>
              <span>Deadline: {formatDate(row.deadline)}</span>
              <span>Applied: {formatDate(row.date_applied)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
