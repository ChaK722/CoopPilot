import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  applyMigrations,
  asUser,
  bootstrapAuthShim,
  createUser,
  startTestPostgres,
  type TestPostgres,
} from "@/tests/db/helpers";

// Phase 6 analytics snapshot: fixed fixture, exact reconciliation, archive
// exclusion, timezone-aware submission dates, skill aggregation, ACLs, and
// the board match-score RPC - all on real embedded PostgreSQL.

const TODAY = "2026-08-02";
const D_PLUS_7 = "2026-08-09";
const D_PLUS_8 = "2026-08-10";
const D_MINUS_1 = "2026-08-01";
const D_PLUS_3 = "2026-08-05";

describe("Phase 6 analytics RPC", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let userC: string;

  const ids = {
    a1: "a1000000-0000-4000-8000-000000000001",
    a2: "a1000000-0000-4000-8000-000000000002",
    a3: "a1000000-0000-4000-8000-000000000003",
    a4: "a1000000-0000-4000-8000-000000000004",
    a5: "a1000000-0000-4000-8000-000000000005",
    a6: "a1000000-0000-4000-8000-000000000006",
    a7: "a1000000-0000-4000-8000-000000000007",
    a8: "a1000000-0000-4000-8000-000000000008",
    a9: "a1000000-0000-4000-8000-000000000009",
    a10: "a1000000-0000-4000-8000-000000000010",
    a11: "a1000000-0000-4000-8000-000000000011",
    a12: "a1000000-0000-4000-8000-000000000012",
    b1: "b1000000-0000-4000-8000-000000000001",
  };

  async function insertApp(
    userId: string,
    appId: string,
    company: string,
    status: string,
    overrides: Record<string, unknown> = {},
  ) {
    await ctx.admin.query(
      `insert into public.applications (
         id, user_id, creation_key, company, job_title, original_description, status,
         deadline, date_applied, archived_at, updated_at
       ) values (
         $1, $2, gen_random_uuid(), $3, 'Role', 'Job text', $4,
         $5, $6, $7, $8
       )`,
      [
        appId,
        userId,
        company,
        status,
        overrides.deadline ?? null,
        overrides.date_applied ?? null,
        overrides.archived_at ?? null,
        overrides.updated_at ?? "2026-08-01T00:00:00.000Z",
      ],
    );
  }

  async function insertEvent(
    userId: string,
    appId: string,
    fromStatus: string | null,
    toStatus: string,
    changedAt: string,
  ) {
    await ctx.admin.query(
      `insert into public.application_status_events
         (user_id, application_id, from_status, to_status, changed_at)
       values ($1, $2, $3, $4, $5)`,
      [userId, appId, fromStatus, toStatus, changedAt],
    );
  }

  async function insertSkill(
    userId: string,
    appId: string,
    requirementType: string,
    name: string,
    normalizedName: string,
  ) {
    await ctx.admin.query(
      `insert into public.application_skills
         (user_id, application_id, requirement_type, name, normalized_name, sort_order)
       values ($1, $2, $3, $4, $5, 0)`,
      [userId, appId, requirementType, name, normalizedName],
    );
  }

  async function snapshot(userId: string): Promise<Record<string, unknown>> {
    const result = await asUser(
      ctx.port,
      userId,
      `select public.get_application_analytics('${userId}', '${TODAY}') as snap`,
    );
    return result.rows[0].snap as Record<string, unknown>;
  }

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "analytics-a@example.test");
    userB = await createUser(ctx.admin, "analytics-b@example.test");
    userC = await createUser(ctx.admin, "analytics-c@example.test");
    await ctx.admin.query(`create role public_only_probe nologin`);

    // --- User A fixture (11 non-archived + 1 archived) ---
    await insertApp(userA, ids.a1, "Zulu One", "saved", {
      deadline: D_PLUS_7,
      updated_at: "2026-08-02T09:00:00.000Z",
    });
    await insertEvent(userA, ids.a1, null, "saved", "2026-08-01T16:00:00.000Z");

    await insertApp(userA, ids.a2, "Alpha Expired", "saved", {
      deadline: D_MINUS_1,
      updated_at: "2026-08-01T08:00:00.000Z",
    });
    await insertEvent(userA, ids.a2, null, "saved", "2026-07-30T16:00:00.000Z");

    await insertApp(userA, ids.a3, "Bravo Due", "preparing", {
      deadline: D_PLUS_3,
      updated_at: "2026-08-01T07:00:00.000Z",
    });
    await insertEvent(userA, ids.a3, null, "saved", "2026-07-29T16:00:00.000Z");
    await insertEvent(userA, ids.a3, "saved", "preparing", "2026-07-30T16:00:00.000Z");

    await insertApp(userA, ids.a4, "Delta Applied", "applied", {
      deadline: D_PLUS_8,
      date_applied: "2026-06-15",
      updated_at: "2026-08-02T10:00:00.000Z",
    });
    await insertEvent(userA, ids.a4, null, "saved", "2026-06-10T16:00:00.000Z");
    await insertEvent(userA, ids.a4, "saved", "applied", "2026-06-15T18:00:00.000Z");
    await insertSkill(userA, ids.a4, "required", "TypeScript", "typescript");
    await insertSkill(userA, ids.a4, "preferred", "AWS", "aws");

    await insertApp(userA, ids.a5, "Echo Rejected", "rejected", {
      updated_at: "2026-07-30T00:00:00.000Z",
    });
    await insertEvent(userA, ids.a5, null, "saved", "2026-07-15T16:00:00.000Z");
    await insertEvent(userA, ids.a5, "saved", "applied", "2026-07-20T16:00:00.000Z");
    await insertEvent(userA, ids.a5, "applied", "interview", "2026-07-25T16:00:00.000Z");
    await insertEvent(userA, ids.a5, "interview", "rejected", "2026-07-28T16:00:00.000Z");
    await insertSkill(userA, ids.a5, "required", "TypeScript", "typescript");
    await insertSkill(userA, ids.a5, "required", "React", "react");

    await insertApp(userA, ids.a6, "Foxtrot Withdrawn", "withdrawn", {
      updated_at: "2026-08-02T11:00:00.000Z",
    });
    await insertEvent(userA, ids.a6, null, "saved", "2026-07-01T16:00:00.000Z");
    await insertEvent(userA, ids.a6, "saved", "applied", "2026-07-05T16:00:00.000Z");
    await insertEvent(userA, ids.a6, "applied", "offer", "2026-07-10T16:00:00.000Z");
    await insertEvent(userA, ids.a6, "offer", "withdrawn", "2026-07-12T16:00:00.000Z");
    await insertSkill(userA, ids.a6, "preferred", "TypeScript", "typescript");
    await insertSkill(userA, ids.a6, "preferred", "Python", "python");

    await insertApp(userA, ids.a7, "Golf Archived", "applied", {
      date_applied: "2026-07-01",
      archived_at: "2026-08-01T12:00:00.000Z",
    });
    await insertEvent(userA, ids.a7, null, "saved", "2026-06-20T16:00:00.000Z");
    await insertEvent(userA, ids.a7, "saved", "applied", "2026-07-01T16:00:00.000Z");
    await insertEvent(userA, ids.a7, "applied", "interview", "2026-07-10T16:00:00.000Z");
    await insertSkill(userA, ids.a7, "required", "Legacy", "legacy");

    await insertApp(userA, ids.a8, "Hotel Manual Date", "applied", {
      date_applied: "2026-05-10",
      updated_at: "2026-08-01T06:00:00.000Z",
    });
    await insertEvent(userA, ids.a8, null, "saved", "2026-05-01T16:00:00.000Z");
    await insertEvent(userA, ids.a8, "saved", "applied", "2026-08-01T16:00:00.000Z");

    await insertApp(userA, ids.a9, "India Fallback", "applied", {
      updated_at: "2026-08-01T05:00:00.000Z",
    });
    await insertEvent(userA, ids.a9, null, "saved", "2026-01-10T00:00:00.000Z");
    await insertEvent(userA, ids.a9, "saved", "applied", "2026-07-01T03:30:00.000Z");

    await insertApp(userA, ids.a10, "Alpha Tie", "saved", {
      deadline: D_PLUS_7,
      updated_at: "2026-08-02T12:00:00.000Z",
    });
    await insertEvent(userA, ids.a10, null, "saved", "2026-08-01T16:00:00.000Z");

    await insertApp(userA, ids.a11, "Zebra Tie", "saved", {
      deadline: D_PLUS_7,
      updated_at: "2026-08-02T12:00:00.000Z",
    });
    await insertEvent(userA, ids.a11, null, "saved", "2026-08-01T16:00:00.000Z");

    await insertApp(userA, ids.a12, "Zulu Expired", "saved", {
      deadline: D_MINUS_1,
      updated_at: "2026-08-02T13:00:00.000Z",
    });
    await insertEvent(userA, ids.a12, null, "saved", "2026-07-31T16:00:00.000Z");

    // --- User B: one applied app with 12 skills (top-10 truncation) ---
    await insertApp(userB, ids.b1, "Bravo Skills", "applied", {
      updated_at: "2026-07-20T00:00:00.000Z",
    });
    await insertEvent(userB, ids.b1, null, "saved", "2026-07-10T16:00:00.000Z");
    await insertEvent(userB, ids.b1, "saved", "applied", "2026-07-15T16:00:00.000Z");
    for (let index = 0; index < 12; index += 1) {
      const padded = String(index).padStart(2, "0");
      await insertSkill(userB, ids.b1, "required", `Skill ${padded}`, `skill${padded}`);
    }
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("returns the exact summary for the fixed fixture", async () => {
    const snap = await snapshot(userA);
    const summary = snap.summary as Record<string, unknown>;
    expect(summary).toEqual({
      total: 11,
      active: 9,
      interviews: 1,
      offers: 1,
      applied_denominator: 5,
      upcoming_deadlines: 4,
      interview_rate: 20,
      offer_rate: 20,
    });
  });

  it("returns all seven status counts in fixed order summing to total", async () => {
    const snap = await snapshot(userA);
    const counts = snap.status_counts as Array<{ status: string; count: number }>;
    expect(counts).toEqual([
      { status: "saved", count: 5 },
      { status: "preparing", count: 1 },
      { status: "applied", count: 3 },
      { status: "interview", count: 0 },
      { status: "offer", count: 0 },
      { status: "rejected", count: 1 },
      { status: "withdrawn", count: 1 },
    ]);
    expect(counts.reduce((sum, item) => sum + item.count, 0)).toBe(
      (snap.summary as Record<string, unknown>).total,
    );
  });

  it("uses date_applied first and the earliest applied-stage event otherwise", async () => {
    const snap = await snapshot(userA);
    const months = snap.submissions_over_time as Array<{ month: string; count: number }>;
    expect(months).toEqual([
      { month: "2026-05", count: 1 }, // A8: stored date_applied beats an August event
      { month: "2026-06", count: 2 }, // A4 date_applied; A9 Toronto boundary fallback
      { month: "2026-07", count: 2 }, // A5, A6 earliest applied-stage events
    ]);
  });

  it("never uses created_at as the submission date", async () => {
    const snap = await snapshot(userA);
    const months = snap.submissions_over_time as Array<{ month: string }>;
    expect(months.some((item) => item.month === "2026-01")).toBe(false);
  });

  it("converts status events to America/Toronto calendar months", async () => {
    // A9's applied event is 2026-07-01T03:30Z, which is 2026-06-30 in Toronto.
    const snap = await snapshot(userA);
    const months = snap.submissions_over_time as Array<{ month: string; count: number }>;
    expect(months.find((item) => item.month === "2026-06")?.count).toBe(2);
  });

  it("aggregates top skills by distinct application with required/preferred splits", async () => {
    const snap = await snapshot(userA);
    const skills = snap.top_skills as Array<{
      normalized_name: string;
      name: string;
      total_count: number;
      required_count: number;
      preferred_count: number;
    }>;
    expect(skills).toEqual([
      {
        normalized_name: "typescript",
        name: "TypeScript",
        total_count: 3,
        required_count: 2,
        preferred_count: 1,
      },
      {
        normalized_name: "aws",
        name: "AWS",
        total_count: 1,
        required_count: 0,
        preferred_count: 1,
      },
      {
        normalized_name: "python",
        name: "Python",
        total_count: 1,
        required_count: 0,
        preferred_count: 1,
      },
      {
        normalized_name: "react",
        name: "React",
        total_count: 1,
        required_count: 1,
        preferred_count: 0,
      },
    ]);
  });

  it("truncates top skills to 10 with deterministic tie-breakers", async () => {
    const snap = await snapshot(userB);
    const skills = snap.top_skills as Array<{ normalized_name: string }>;
    expect(skills).toHaveLength(10);
    expect(skills.map((skill) => skill.normalized_name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `skill${String(index).padStart(2, "0")}`),
    );
  });

  it("keeps user A's snapshot free of user B data", async () => {
    const snap = await snapshot(userA);
    const skills = snap.top_skills as Array<{ normalized_name: string }>;
    expect(skills.some((skill) => skill.normalized_name.startsWith("skill"))).toBe(false);
    expect((snap.summary as Record<string, unknown>).total).toBe(11);
  });

  it("excludes archived applications and their skills/events from every section", async () => {
    const snap = await snapshot(userA);
    const skills = snap.top_skills as Array<{ normalized_name: string }>;
    expect(skills.some((skill) => skill.normalized_name === "legacy")).toBe(false);
    const summary = snap.summary as Record<string, unknown>;
    // A7 (archived) had applied + interview events; neither can inflate counts.
    expect(summary.interviews).toBe(1);
    expect(summary.total).toBe(11);
    const counts = snap.status_counts as Array<{ status: string; count: number }>;
    expect(counts.find((item) => item.status === "applied")?.count).toBe(3);
    expect(snap.recently_updated as unknown[]).toHaveLength(5);
  });

  it("includes day 0 and day 7 deadlines in upcoming but not day 8 or expired", async () => {
    const snap = await snapshot(userA);
    const upcoming = snap.upcoming_deadlines as Array<{
      id: string;
      company: string;
      deadline: string;
    }>;
    expect(upcoming.map((item) => item.id)).toEqual([ids.a3, ids.a10, ids.a11, ids.a1]);
    expect((snap.summary as Record<string, unknown>).upcoming_deadlines).toBe(4);
    expect(upcoming.some((item) => item.deadline === D_PLUS_8)).toBe(false);
    expect(upcoming.some((item) => item.deadline === D_MINUS_1)).toBe(false);
  });

  it("sorts requiring action by priority, deadline, updated_at, and id", async () => {
    const snap = await snapshot(userA);
    const action = snap.requiring_action as Array<{
      id: string;
      reason: string;
      deadline: string;
    }>;
    expect(action.map((item) => item.id)).toEqual([ids.a12, ids.a2, ids.a3]);
    expect(action[0].reason).toBe("Deadline passed");
    expect(action[1].reason).toBe("Deadline passed");
    expect(action[2].reason).toBe("Apply before deadline");
    // Day 7 upcoming record is not in requiring action (outside the 3-day window).
    expect(action.some((item) => item.id === ids.a1)).toBe(false);
  });

  it("sorts recently updated by updated_at desc then id asc, capped at 5", async () => {
    const snap = await snapshot(userA);
    const recent = snap.recently_updated as Array<{ id: string }>;
    expect(recent.map((item) => item.id)).toEqual([ids.a12, ids.a10, ids.a11, ids.a6, ids.a4]);
  });

  it("returns a complete empty snapshot for a user with no applications", async () => {
    const snap = await snapshot(userC);
    expect(snap.summary).toEqual({
      total: 0,
      active: 0,
      interviews: 0,
      offers: 0,
      applied_denominator: 0,
      upcoming_deadlines: 0,
      interview_rate: null,
      offer_rate: null,
    });
    expect(snap.status_counts).toEqual([
      { status: "saved", count: 0 },
      { status: "preparing", count: 0 },
      { status: "applied", count: 0 },
      { status: "interview", count: 0 },
      { status: "offer", count: 0 },
      { status: "rejected", count: 0 },
      { status: "withdrawn", count: 0 },
    ]);
    expect(snap.submissions_over_time).toEqual([]);
    expect(snap.top_skills).toEqual([]);
    expect(snap.upcoming_deadlines).toEqual([]);
    expect(snap.recently_updated).toEqual([]);
    expect(snap.requiring_action).toEqual([]);
  });

  it("recomputes rates after archiving and restoring an applied application", async () => {
    await ctx.admin.query(`update public.applications set archived_at = now() where id = $1`, [
      ids.a4,
    ]);
    let snap = await snapshot(userA);
    expect((snap.summary as Record<string, unknown>).total).toBe(10);
    expect((snap.summary as Record<string, unknown>).applied_denominator).toBe(4);
    expect((snap.summary as Record<string, unknown>).interview_rate).toBe(25);
    expect((snap.summary as Record<string, unknown>).offer_rate).toBe(25);
    const months = snap.submissions_over_time as Array<{ month: string; count: number }>;
    expect(months.find((item) => item.month === "2026-06")?.count).toBe(1);

    await ctx.admin.query(`update public.applications set archived_at = null where id = $1`, [
      ids.a4,
    ]);
    snap = await snapshot(userA);
    expect((snap.summary as Record<string, unknown>).total).toBe(11);
    expect((snap.summary as Record<string, unknown>).interview_rate).toBe(20);
  });

  it("rejects a forged p_user_id", async () => {
    await expect(
      asUser(ctx.port, userA, `select public.get_application_analytics('${userB}', '${TODAY}')`),
    ).rejects.toThrow(/not allowed/i);
  });

  it("enforces the analytics ACL matrix", async () => {
    for (const [role, signature, expected] of [
      ["public_only_probe", "get_application_analytics(uuid, date)", false],
      ["anon", "get_application_analytics(uuid, date)", false],
      ["authenticated", "get_application_analytics(uuid, date)", true],
      ["public_only_probe", "get_board_match_scores(uuid)", false],
      ["anon", "get_board_match_scores(uuid)", false],
      ["authenticated", "get_board_match_scores(uuid)", true],
    ] as const) {
      const { rows } = await ctx.admin.query(
        `select has_function_privilege($1, $2, 'EXECUTE') as granted`,
        [role, signature],
      );
      expect(rows[0].granted).toBe(expected);
    }
  });

  it("returns the latest match score per non-archived application in one RPC", async () => {
    await ctx.admin.query(
      `insert into public.match_analyses (
         user_id, application_id, overall_score, score_breakdown,
         profile_source_hash, application_source_hash, generation_mode, generated_at
       ) values
         ($1, $2, 60, '{}', 'hp', 'ha', 'demo', '2026-08-01T00:00:00.000Z'),
         ($1, $2, 78, '{}', 'hp', 'ha', 'demo', '2026-08-02T00:00:00.000Z'),
         ($1, $3, 40, '{}', 'hp', 'ha', 'demo', '2026-08-01T00:00:00.000Z'),
         ($1, $4, 90, '{}', 'hp', 'ha', 'demo', '2026-08-01T00:00:00.000Z')`,
      [userA, ids.a1, ids.a2, ids.a7],
    );

    const result = await asUser(
      ctx.port,
      userA,
      `select * from public.get_board_match_scores('${userA}')`,
    );
    const rows = result.rows as Array<{ application_id: string; overall_score: number }>;
    expect(rows).toEqual([
      { application_id: ids.a1, overall_score: 78 },
      { application_id: ids.a2, overall_score: 40 },
    ]);

    await expect(
      asUser(ctx.port, userA, `select * from public.get_board_match_scores('${userB}')`),
    ).rejects.toThrow(/not allowed/i);
  });
});
