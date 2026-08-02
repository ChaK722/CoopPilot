"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, GripVertical } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { updateApplicationStatus } from "@/features/applications/application-actions";
import { DatePromptDialog } from "@/features/applications/date-applied-dialog";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/validation/applications";
import { deadlineState } from "@/lib/deadline";

export interface BoardApplication {
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

const COLUMN_WIDTH = 280;
const CARD_HEIGHT = 96;

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  switch (event.code) {
    case "ArrowRight":
      return { ...currentCoordinates, x: currentCoordinates.x + COLUMN_WIDTH };
    case "ArrowLeft":
      return { ...currentCoordinates, x: currentCoordinates.x - COLUMN_WIDTH };
    case "ArrowDown":
      return { ...currentCoordinates, y: currentCoordinates.y + CARD_HEIGHT };
    case "ArrowUp":
      return { ...currentCoordinates, y: currentCoordinates.y - CARD_HEIGHT };
    default:
      return undefined;
  }
};

interface BoardProps {
  initial: BoardApplication[];
  today: string;
}

/**
 * Merges a fresh server payload with in-flight optimistic state: cards with
 * no pending mutation follow the server; pending cards keep their optimistic
 * values until the action settles.
 */
function mergeWithPending(
  current: BoardApplication[],
  next: BoardApplication[],
  pendingIds: Set<string>,
): BoardApplication[] {
  return next.map((app) => {
    const optimistic = current.find((item) => item.id === app.id);
    return pendingIds.has(app.id) && optimistic ? optimistic : app;
  });
}

function sortBoard(apps: BoardApplication[]): BoardApplication[] {
  return [...apps].sort((a, b) => {
    if (a.updated_at !== b.updated_at) {
      return a.updated_at < b.updated_at ? 1 : -1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

export function ApplicationBoard({ initial, today }: BoardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [apps, setApps] = useState<BoardApplication[]>(() => sortBoard(initial));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const [datePrompt, setDatePrompt] = useState<BoardApplication | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pendingFocusRestoreId, setPendingFocusRestoreId] = useState<string | null>(null);
  const pendingFocusRestoreIdRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  // Sync server payloads without clobbering optimistic state.
  useEffect(() => {
    setApps((current) => {
      const pending = pendingRef.current;
      if (pending.size === 0) {
        return sortBoard(initial);
      }
      return sortBoard(mergeWithPending(current, initial, pending));
    });
  }, [initial]);

  // Mutation-lifecycle focus restore: once the target application leaves the
  // pending set, its selector is enabled again; only then restore focus.
  useEffect(() => {
    const restoreId = pendingFocusRestoreIdRef.current;
    if (!restoreId) return;
    if (pendingIds.has(restoreId)) return;

    const attempt = () => {
      const select = document.querySelector<HTMLSelectElement>(
        `select[data-app-id="${restoreId}"]`,
      );
      if (!select) {
        // Target record is gone; safely abandon the restore.
        pendingFocusRestoreIdRef.current = null;
        setPendingFocusRestoreId(null);
        return;
      }
      if (!select.disabled) {
        select.focus();
        pendingFocusRestoreIdRef.current = null;
        setPendingFocusRestoreId(null);
        return;
      }
      // Selector is still disabled (DOM not yet reflecting the pending
      // removal); one rAF retry only - never a polling loop.
      requestAnimationFrame(() => {
        const again = document.querySelector<HTMLSelectElement>(
          `select[data-app-id="${restoreId}"]`,
        );
        if (again && !again.disabled) {
          again.focus();
        }
        pendingFocusRestoreIdRef.current = null;
        setPendingFocusRestoreId(null);
      });
    };

    requestAnimationFrame(attempt);
  }, [pendingIds, pendingFocusRestoreId]);

  const grouped = useMemo(() => {
    const groups = new Map<ApplicationStatus, BoardApplication[]>();
    for (const status of APPLICATION_STATUSES) {
      groups.set(status, []);
    }
    for (const app of apps) {
      groups.get(app.status)?.push(app);
    }
    return groups;
  }, [apps]);

  function focusAppSelectImmediately(appId: string) {
    requestAnimationFrame(() => {
      document.querySelector<HTMLSelectElement>(`select[data-app-id="${appId}"]`)?.focus();
    });
  }

  async function performStatusChange(
    appId: string,
    toStatus: ApplicationStatus,
    dateApplied: string | null,
  ) {
    if (pendingRef.current.has(appId)) return;
    const previous = apps.find((app) => app.id === appId);
    if (!previous) return;

    pendingRef.current = new Set(pendingRef.current).add(appId);
    setPendingIds(new Set(pendingRef.current));
    setApps((current) =>
      current.map((app) =>
        app.id === appId
          ? { ...app, status: toStatus, date_applied: dateApplied ?? app.date_applied }
          : app,
      ),
    );

    const result = await updateApplicationStatus(appId, toStatus, dateApplied);

    if (!result.ok) {
      // Single-record rollback: only the target card is restored.
      setApps((current) =>
        current.map((app) =>
          app.id === appId
            ? {
                ...app,
                status: previous.status,
                date_applied: previous.date_applied,
              }
            : app,
        ),
      );
      setAnnouncement(result.error);
      toast(result.error, "error");
    } else {
      setAnnouncement(`Moved to ${APPLICATION_STATUS_LABELS[toStatus]}.`);
      router.refresh();
    }

    pendingRef.current = new Set([...pendingRef.current].filter((id) => id !== appId));
    setPendingIds(new Set(pendingRef.current));
  }

  function requestStatusChange(app: BoardApplication, toStatus: ApplicationStatus) {
    if (pendingIds.has(app.id)) return;
    if (toStatus === "applied" && app.date_applied === null) {
      setDatePrompt(app);
      return;
    }
    void performStatusChange(app.id, toStatus, null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const appId = String(event.active.id);
    const columnId = event.over ? String(event.over.id) : null;
    if (!columnId || !APPLICATION_STATUSES.includes(columnId as ApplicationStatus)) return;
    const app = apps.find((item) => item.id === appId);
    if (!app) return;
    requestStatusChange(app, columnId as ApplicationStatus);
  }

  function closeDatePrompt(cancelOnly = false) {
    if (datePrompt) {
      const appId = datePrompt.id;
      setDatePrompt(null);
      if (cancelOnly) {
        // No mutation ran; restore focus immediately after the dialog closes.
        focusAppSelectImmediately(appId);
      } else {
        // Save/Skip: restore focus only after the mutation lifecycle finishes.
        pendingFocusRestoreIdRef.current = appId;
        setPendingFocusRestoreId(appId);
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {APPLICATION_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              apps={grouped.get(status) ?? []}
              today={today}
              pendingIds={pendingIds}
              onStatusChange={requestStatusChange}
            />
          ))}
        </div>
      </DndContext>

      <DatePromptDialog
        key={datePrompt?.id ?? "none"}
        app={datePrompt}
        onConfirm={(date) => {
          if (!datePrompt) return;
          const appId = datePrompt.id;
          void performStatusChange(appId, "applied", date);
          closeDatePrompt(false);
        }}
        onSkip={() => {
          if (!datePrompt) return;
          const appId = datePrompt.id;
          void performStatusChange(appId, "applied", null);
          closeDatePrompt(false);
        }}
        onCancel={() => closeDatePrompt(true)}
      />
    </div>
  );
}

function BoardColumn({
  status,
  apps,
  today,
  pendingIds,
  onStatusChange,
}: {
  status: ApplicationStatus;
  apps: BoardApplication[];
  today: string;
  pendingIds: Set<string>;
  onStatusChange: (app: BoardApplication, status: ApplicationStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${APPLICATION_STATUS_LABELS[status]} column`}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${
        isOver ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{APPLICATION_STATUS_LABELS[status]}</h2>
        <span
          className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
          aria-label={`${apps.length} applications`}
        >
          {apps.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {apps.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No applications here yet
          </p>
        ) : (
          apps.map((app) => (
            <BoardCard
              key={app.id}
              app={app}
              today={today}
              disabled={pendingIds.has(app.id)}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BoardCard({
  app,
  today,
  disabled,
  onStatusChange,
}: {
  app: BoardApplication;
  today: string;
  disabled: boolean;
  onStatusChange: (app: BoardApplication, status: ApplicationStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.id,
    data: { status: app.status },
    disabled,
  });

  const state = deadlineState(app.deadline, app.status, today);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={`relative rounded-md border bg-card p-3 shadow-sm ${
        isDragging ? "z-10 opacity-70 ring-2 ring-primary" : ""
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <div className="flex items-start gap-1">
        <Link
          href={`/applications/${app.id}`}
          className="min-w-0 flex-1 rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate">{app.company}</span>
          <span className="block truncate text-sm text-foreground">{app.job_title}</span>
        </Link>
        <button
          type="button"
          {...listeners}
          {...attributes}
          disabled={disabled}
          aria-label={`Move ${app.company} — ${app.job_title}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {app.location ?? "No location"} · Applied: {app.date_applied ?? "—"}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Deadline: {app.deadline ?? "—"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
          {APPLICATION_STATUS_LABELS[app.status]}
        </span>
        {state === "expired_unapplied" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Deadline passed
          </span>
        ) : state === "upcoming" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            Upcoming
          </span>
        ) : null}
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-xs">
        <span className="sr-only">Status for {app.company}</span>
        <select
          data-app-id={app.id}
          value={app.status}
          disabled={disabled}
          onChange={(event) => onStatusChange(app, event.target.value as ApplicationStatus)}
          className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
