/**
 * Deterministic date formatting shared by server and client renders.
 *
 * `Date.prototype.toLocaleString()` with no arguments produces different
 * output in Node (server) and Chrome (client), which causes React hydration
 * mismatches. These helpers pin an explicit ICU locale so both runtimes
 * render identical text.
 */

function toDate(value: string | Date): Date {
  if (typeof value !== "string") return value;
  // Date-only values are parsed as UTC midnight so the calendar day never
  // shifts between the database and the browser.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(toDate(value));
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(toDate(value));
}
