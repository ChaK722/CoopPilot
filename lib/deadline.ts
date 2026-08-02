import type { ApplicationStatus } from "@/lib/validation/applications";

export const UPCOMING_DEADLINE_WINDOW_DAYS = 7;

/** Local calendar date (YYYY-MM-DD) used for deadline comparisons. */
export function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function isDeadlineExpired(deadline: string | null, today: string): boolean {
  return deadline !== null && deadline !== "" && deadline < today;
}

export function isDeadlineUpcoming(
  deadline: string | null,
  today: string,
  windowDays = UPCOMING_DEADLINE_WINDOW_DAYS,
): boolean {
  if (deadline === null || deadline === "") return false;
  return deadline >= today && deadline <= addCalendarDays(today, windowDays);
}

export type DeadlineState = "expired_unapplied" | "upcoming" | "none";

/**
 * Board/table deadline state:
 * - "expired_unapplied": deadline passed AND the application is still in
 *   Saved or Preparing (applied-stage records never receive this warning).
 * - "upcoming": deadline is today through today+7 (inclusive).
 * - "none": no deadline, or deadline outside the windows.
 */
export function deadlineState(
  deadline: string | null,
  status: ApplicationStatus,
  today: string,
): DeadlineState {
  const expired = isDeadlineExpired(deadline, today);
  if (expired && (status === "saved" || status === "preparing")) {
    return "expired_unapplied";
  }
  if (isDeadlineUpcoming(deadline, today)) {
    return "upcoming";
  }
  return "none";
}
