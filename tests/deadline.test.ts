import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  deadlineState,
  isDeadlineExpired,
  isDeadlineUpcoming,
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
