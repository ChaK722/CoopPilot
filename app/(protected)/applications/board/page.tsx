import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createApplicationService } from "@/features/applications/application-service";
import { BoardMount } from "@/features/applications/board-mount";
import type { BoardApplication } from "@/features/applications/board";
import { addCalendarDays, todayDateString } from "@/lib/deadline";

export const metadata: Metadata = {
  title: "Board",
};

export default async function BoardPage() {
  const user = await requireUser();
  const service = createApplicationService(await createServerSupabaseClient());

  let rows: BoardApplication[];
  try {
    rows = await service.listBoardWithScores(user.id);
  } catch {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Board</h1>
        <div className="flex items-start gap-3 rounded-md border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load your board</p>
            <p className="text-sm text-muted-foreground">Please refresh the page to try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const today = todayDateString();
  const upcoming = rows
    .filter(
      (app) => app.deadline && app.deadline >= today && app.deadline <= addCalendarDays(today, 7),
    )
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag cards between columns, or use each card&apos;s status selector. Keyboard users can
          drag with the arrow keys after focusing a card.
        </p>
      </header>

      {upcoming.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">Upcoming deadlines (next 7 days)</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {upcoming.map((app) => (
              <li key={app.id}>
                <a
                  href={`/applications/${app.id}`}
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  {app.company} — {app.deadline}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BoardMount initial={rows} today={today} />
    </div>
  );
}
