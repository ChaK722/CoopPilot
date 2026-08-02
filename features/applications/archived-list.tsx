"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { restoreApplication } from "@/features/applications/application-actions";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/validation/applications";
import { formatDate } from "@/lib/dates";

export interface ArchivedApplicationRow {
  id: string;
  company: string;
  job_title: string;
  status: ApplicationStatus;
  deadline: string | null;
  archived_at: string | null;
}

export function ArchivedApplicationsList({ initial }: { initial: ArchivedApplicationRow[] }) {
  const router = useRouter();
  const { toast } = useToast();

  async function handleRestore(id: string) {
    const result = await restoreApplication(id);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Application restored.", "success");
    router.refresh();
  }

  if (initial.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
        <Archive className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No archived applications</p>
        <p className="text-sm text-muted-foreground">
          Archive applications from their detail page when you are done with them.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {initial.map((app) => (
        <li
          key={app.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {app.company} — {app.job_title}
            </p>
            <p className="text-xs text-muted-foreground">
              {APPLICATION_STATUS_LABELS[app.status]}
              {app.deadline ? ` · Deadline ${app.deadline}` : ""}
              {app.archived_at ? ` · Archived ${formatDate(app.archived_at)}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleRestore(app.id)}>
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}
