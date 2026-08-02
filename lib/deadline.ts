import type { ApplicationStatus } from "@/lib/validation/applications";

export const UPCOMING_DEADLINE_WINDOW_DAYS = 7;

/** Product timezone for calendar-date decisions (independent of host TZ). */
export const PRODUCT_TIME_ZONE = "America/Toronto";

/**
 * Today's calendar date in America/Toronto (YYYY-MM-DD). The host server may
 * be UTC (AWS) or local; results are identical everywhere. Accepts an
 * optional Date so tests can fix the instant.
 */
export function todayDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not format America/Toronto date.");
  }
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
