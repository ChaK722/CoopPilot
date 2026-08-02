import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createApplicationService } from "@/features/applications/application-service";
import {
  ArchivedApplicationsList,
  type ArchivedApplicationRow,
} from "@/features/applications/archived-list";

export const metadata: Metadata = {
  title: "Archive",
};

export default async function ArchivePage() {
  const user = await requireUser();
  const service = createApplicationService(await createServerSupabaseClient());

  let rows: ArchivedApplicationRow[];
  try {
    rows = (await service.listArchivedApplications(user.id)) as ArchivedApplicationRow[];
  } catch {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Archive</h1>
        <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load the archive</p>
            <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Archive</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Archived applications are hidden from the board and table. Restore them to continue
          tracking.
        </p>
      </header>
      <ArchivedApplicationsList initial={rows} />
    </div>
  );
}
