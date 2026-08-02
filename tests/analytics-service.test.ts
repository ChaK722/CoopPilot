import { describe, expect, it, vi } from "vitest";
import { createAnalyticsService } from "@/features/analytics/analytics-service";
import type { AnalyticsSnapshotData } from "@/features/analytics/analytics-schema";
import { AppError } from "@/lib/errors";

function mockSupabase(results: Record<string, unknown[]>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rpc = vi.fn((name: string, params: unknown) => {
    calls.push({ method: "rpc", args: [name, params] });
    return (results.rpc ?? []).shift() ?? { data: null, error: null };
  });
  return {
    client: { rpc } as never,
    calls,
    rpc,
  };
}

const VALID_SNAPSHOT: AnalyticsSnapshotData = {
  summary: {
    total: 11,
    active: 9,
    interviews: 1,
    offers: 1,
    applied_denominator: 5,
    upcoming_deadlines: 4,
    interview_rate: 20,
    offer_rate: null,
  },
  status_counts: [
    { status: "saved", count: 5 },
    { status: "preparing", count: 1 },
    { status: "applied", count: 3 },
    { status: "interview", count: 0 },
    { status: "offer", count: 0 },
    { status: "rejected", count: 1 },
    { status: "withdrawn", count: 1 },
  ],
  submissions_over_time: [{ month: "2026-07", count: 3 }],
  top_skills: [
    {
      normalized_name: "typescript",
      name: "TypeScript",
      total_count: 3,
      required_count: 2,
      preferred_count: 1,
    },
  ],
  upcoming_deadlines: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company: "Acme",
      job_title: "Intern",
      deadline: "2026-08-05",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  recently_updated: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company: "Acme",
      job_title: "Intern",
      status: "saved",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  requiring_action: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company: "Acme",
      job_title: "Intern",
      status: "saved",
      deadline: "2026-08-01",
      updated_at: "2026-08-01T00:00:00.000Z",
      reason: "Deadline passed",
    },
  ],
};

describe("createAnalyticsService", () => {
  it("loads the full snapshot with exactly one RPC call", async () => {
    const supabase = mockSupabase({ rpc: [{ data: VALID_SNAPSHOT, error: null }] });
    const service = createAnalyticsService(supabase.client);

    const snapshot = await service.getSnapshot("user-a", "2026-08-02");

    expect(snapshot.summary.total).toBe(11);
    expect(snapshot.summary.offer_rate).toBeNull();
    expect(snapshot.status_counts).toHaveLength(7);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("get_application_analytics", {
      p_user_id: "user-a",
      p_today: "2026-08-02",
    });
  });

  it("rejects a malformed snapshot safely", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: { summary: { total: "not-a-number" }, status_counts: [] }, error: null }],
    });
    const service = createAnalyticsService(supabase.client);

    await expect(service.getSnapshot("user-a", "2026-08-02")).rejects.toMatchObject({
      kind: "unexpected",
    });
  });

  it("rejects a snapshot with wrong status count shape", async () => {
    const bad = structuredClone(VALID_SNAPSHOT) as typeof VALID_SNAPSHOT;
    bad.status_counts = bad.status_counts.slice(0, 3);
    const supabase = mockSupabase({ rpc: [{ data: bad, error: null }] });
    const service = createAnalyticsService(supabase.client);

    await expect(service.getSnapshot("user-a", "2026-08-02")).rejects.toMatchObject({
      kind: "unexpected",
    });
  });

  it("maps database errors to a safe AppError", async () => {
    const supabase = mockSupabase({
      rpc: [{ data: null, error: { message: "connection refused", code: "PGRST301" } }],
    });
    const service = createAnalyticsService(supabase.client);

    await expect(service.getSnapshot("user-a", "2026-08-02")).rejects.toMatchObject({
      kind: "database_unavailable",
      safeMessage: "Could not load your dashboard. Please try again.",
    });
  });

  it("preserves null rates instead of coercing them to zero", async () => {
    const zeroDenominator = structuredClone(VALID_SNAPSHOT) as typeof VALID_SNAPSHOT;
    zeroDenominator.summary = {
      ...zeroDenominator.summary,
      applied_denominator: 0,
      interview_rate: null,
      offer_rate: null,
    };
    const supabase = mockSupabase({ rpc: [{ data: zeroDenominator, error: null }] });
    const service = createAnalyticsService(supabase.client);

    const snapshot = await service.getSnapshot("user-a", "2026-08-02");
    expect(snapshot.summary.interview_rate).toBeNull();
    expect(snapshot.summary.offer_rate).toBeNull();
  });

  it("throws AppError rather than leaking unknown error types", async () => {
    const supabase = mockSupabase({ rpc: [{ data: null, error: null }] });
    const service = createAnalyticsService(supabase.client);

    await expect(service.getSnapshot("user-a", "2026-08-02")).rejects.toBeInstanceOf(AppError);
  });
});
