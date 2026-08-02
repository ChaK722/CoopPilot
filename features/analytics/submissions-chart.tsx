"use client";

import { formatMonthLabel } from "@/lib/dates";
import type { SubmissionCount } from "@/features/analytics/analytics-types";

export function SubmissionsChart({ months }: { months: SubmissionCount[] }) {
  const max = months.reduce((highest, item) => Math.max(highest, item.count), 0);

  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 text-sm font-semibold">
        Applications submitted over time
      </figcaption>
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submitted applications yet</p>
      ) : (
        <div className="flex h-36 items-end gap-2">
          {months.map((item) => (
            <div
              key={item.month}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              aria-label={`${formatMonthLabel(item.month)}: ${item.count} applications`}
            >
              <span className="text-xs font-medium">{item.count}</span>
              <span
                className="w-full max-w-10 rounded-t bg-primary"
                style={{ height: `${max > 0 ? (item.count / max) * 100 : 0}%` }}
                aria-hidden="true"
              />
              <span className="truncate text-[11px] text-muted-foreground">
                {formatMonthLabel(item.month)}
              </span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
