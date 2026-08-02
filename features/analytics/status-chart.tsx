"use client";

import { APPLICATION_STATUS_LABELS } from "@/lib/validation/applications";
import type { StatusCount } from "@/features/analytics/analytics-types";

export function StatusChart({ counts }: { counts: StatusCount[] }) {
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 text-sm font-semibold">Applications by status</figcaption>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {counts.map((item) => {
              const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <li
                  key={item.status}
                  className="flex items-center gap-3"
                  aria-label={`${APPLICATION_STATUS_LABELS[item.status]}: ${item.count} applications (${percentage}% of total)`}
                >
                  <span className="w-24 shrink-0 text-sm">
                    {APPLICATION_STATUS_LABELS[item.status]}
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded bg-muted" aria-hidden="true">
                    <span
                      className="block h-full rounded bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm font-medium">{item.count}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Total: {total}</p>
        </>
      )}
    </figure>
  );
}
