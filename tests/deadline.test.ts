import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  deadlineState,
  isDeadlineExpired,
  isDeadlineUpcoming,
  todayDateString,
} from "@/lib/deadline";

const TODAY = "2026-08-02";
const YESTERDAY = "2026-08-01";
const DAY7 = "2026-08-09";
const DAY8 = "2026-08-10";

describe("deadline helpers", () => {
  it("treats yesterday as expired and today/day7 as upcoming", () => {
    expect(isDeadlineExpired(YESTERDAY, TODAY)).toBe(true);
    expect(isDeadlineExpired(TODAY, TODAY)).toBe(false);
    expect(isDeadlineUpcoming(TODAY, TODAY)).toBe(true);
    expect(isDeadlineUpcoming(DAY7, TODAY)).toBe(true);
    expect(isDeadlineUpcoming(DAY8, TODAY)).toBe(false);
    expect(isDeadlineUpcoming(YESTERDAY, TODAY)).toBe(false);
  });

  it("treats a null deadline as neither expired nor upcoming", () => {
    expect(isDeadlineExpired(null, TODAY)).toBe(false);
    expect(isDeadlineUpcoming(null, TODAY)).toBe(false);
  });

  it("computes calendar day arithmetic without timezone drift", () => {
    expect(addCalendarDays(TODAY, 7)).toBe(DAY7);
    expect(addCalendarDays(TODAY, 0)).toBe(TODAY);
    expect(addCalendarDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("deadlineState", () => {
  it("flags expired deadlines only for saved/preparing", () => {
    expect(deadlineState(YESTERDAY, "saved", TODAY)).toBe("expired_unapplied");
    expect(deadlineState(YESTERDAY, "preparing", TODAY)).toBe("expired_unapplied");
    for (const status of ["applied", "interview", "offer", "rejected", "withdrawn"] as const) {
      expect(deadlineState(YESTERDAY, status, TODAY)).toBe("none");
    }
  });

  it("flags upcoming deadlines for today and day 7 but not day 8", () => {
    expect(deadlineState(TODAY, "saved", TODAY)).toBe("upcoming");
    expect(deadlineState(DAY7, "applied", TODAY)).toBe("upcoming");
    expect(deadlineState(DAY8, "saved", TODAY)).toBe("none");
  });

  it("returns none for null deadlines", () => {
    expect(deadlineState(null, "saved", TODAY)).toBe("none");
  });
});

describe("todayDateString America/Toronto", () => {
  it("returns the Toronto date even when UTC is already the next day (EDT, UTC-4)", () => {
    // 03:59 UTC = 23:59 previous day in Toronto (summer EDT).
    expect(todayDateString(new Date("2026-08-03T03:59:00Z"))).toBe("2026-08-02");
    // 04:00 UTC = midnight in Toronto.
    expect(todayDateString(new Date("2026-08-03T04:00:00Z"))).toBe("2026-08-03");
  });

  it("returns the Toronto date even when UTC is ahead by five hours (EST, UTC-5)", () => {
    expect(todayDateString(new Date("2026-01-15T04:59:00Z"))).toBe("2026-01-14");
    expect(todayDateString(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });

  it("is stable across the spring-forward DST transition", () => {
    // 2026-03-08 02:00 EST jumps to 03:00 EDT.
    expect(todayDateString(new Date("2026-03-08T04:59:00Z"))).toBe("2026-03-07");
    expect(todayDateString(new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    expect(todayDateString(new Date("2026-03-08T23:59:00Z"))).toBe("2026-03-08");
  });

  it("is stable across the fall-back DST transition", () => {
    // 2026-11-01: EDT until 02:00, then EST; the calendar date stays Nov 1.
    expect(todayDateString(new Date("2026-11-01T04:00:00Z"))).toBe("2026-11-01");
    expect(todayDateString(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
    expect(todayDateString(new Date("2026-11-01T07:59:00Z"))).toBe("2026-11-01");
  });

  it("returns YYYY-MM-DD and matches the host-independent expectation", () => {
    const value = todayDateString(new Date("2026-08-15T15:00:00Z"));
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 15:00 UTC is still Aug 15 in Toronto (11:00 EDT).
    expect(value).toBe("2026-08-15");
  });
});
