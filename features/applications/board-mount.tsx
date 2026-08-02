"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardApplication } from "@/features/applications/board";

const ApplicationBoard = dynamic(
  () => import("@/features/applications/board").then((mod) => mod.ApplicationBoard),
  {
    ssr: false,
    loading: () => <BoardLoading />,
  },
);

export function BoardMount({ initial, today }: { initial: BoardApplication[]; today: string }) {
  return <ApplicationBoard initial={initial} today={today} />;
}

function BoardLoading() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" aria-label="Loading board">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2"
        >
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
