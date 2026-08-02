"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { formatDate } from "@/lib/dates";
import type {
  RecentlyUpdatedItem,
  RequiringActionItem,
  UpcomingDeadlineItem,
} from "@/features/analytics/analytics-types";

function DeadlineList({ items }: { items: UpcomingDeadlineItem[] }) {
  return (
    <section
      aria-label="Upcoming deadlines"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
        Upcoming deadlines
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No upcoming deadlines</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Link
                href={`/applications/${item.id}`}
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.company} — {item.job_title}
              </Link>
              <span className="ml-2 text-muted-foreground">{item.deadline ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentList({ items }: { items: RecentlyUpdatedItem[] }) {
  return (
    <section aria-label="Recently updated" className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
        Recently updated
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No applications yet</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Link
                href={`/applications/${item.id}`}
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.company} — {item.job_title}
              </Link>
              <span className="ml-2 text-muted-foreground">{formatDate(item.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionList({ items }: { items: RequiringActionItem[] }) {
  return (
    <section
      aria-label="Applications requiring action"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
        Applications requiring action
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing needs attention</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Link
                href={`/applications/${item.id}`}
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.company} — {item.job_title}
              </Link>
              <span className="ml-2 text-muted-foreground">{item.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ActionLists({
  upcoming,
  recent,
  action,
}: {
  upcoming: UpcomingDeadlineItem[];
  recent: RecentlyUpdatedItem[];
  action: RequiringActionItem[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DeadlineList items={upcoming} />
      <RecentList items={recent} />
      <ActionList items={action} />
    </div>
  );
}
