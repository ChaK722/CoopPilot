import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApplicationService } from "@/features/applications/application-service";
import { createProfileService } from "@/features/profile/profile-service";
import { createAnalyticsService } from "@/features/analytics/analytics-service";

function mockSupabase(results: Record<string, unknown[]>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const makeChain = () => {
    const thenable = {
      then(resolve: (value: unknown) => void) {
        resolve(results.chainResult?.shift() ?? { data: [], error: null });
      },
    };
    return new Proxy(thenable, {
      get(target, prop: string) {
        if (prop === "then") return target.then.bind(target);
        if (["maybeSingle", "single"].includes(prop)) {
          return () => {
            calls.push({ method: prop, args: [] });
            return (results[prop] ?? []).shift() ?? { data: null, error: null };
          };
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return makeChain();
        };
      },
    });
  };
  const from = vi.fn(() => makeChain());
  const rpc = vi.fn((name: string, params: unknown) => {
    calls.push({ method: "rpc", args: [name, params] });
    return (results.rpc ?? []).shift() ?? { data: null, error: null };
  });
  return {
    client: { from, rpc } as never,
    calls,
    from,
    rpc,
  };
}

describe("Phase 7 query-count audit (service layer)", () => {
  it("loads a job detail bundle with exactly four bounded queries", async () => {
    const supabase = mockSupabase({
      maybeSingle: [{ data: { id: "app-1", company: "Acme" }, error: null }],
      chainResult: [{ data: [], error: null }],
    });
    const service = createApplicationService(supabase.client);
    await service.getApplication("user-a", "app-1");
    writeFileSync(
      join(process.cwd(), ".tmp-query-debug.txt"),
      JSON.stringify({ calls: supabase.calls, fromCalls: supabase.from.mock.calls.length }),
    );
    expect(supabase.from).toHaveBeenCalledTimes(4);
    // One maybeSingle (application) plus three bounded child queries.
    expect(supabase.calls.filter((call) => call.method === "limit")).toHaveLength(3);
    expect(supabase.calls.filter((call) => call.method === "maybeSingle")).toHaveLength(1);
  });

  it("loads the profile bundle with exactly five bounded queries", async () => {
    const supabase = mockSupabase({
      maybeSingle: [{ data: { id: "p1", user_id: "user-a" }, error: null }],
      chainResult: [{ data: [], error: null }],
    });
    const service = createProfileService(supabase.client);
    await service.getProfileBundle("user-a");
    expect(supabase.from).toHaveBeenCalledTimes(5);
  });

  it("loads the applications list with one bounded query when no search is used", async () => {
    const supabase = mockSupabase({
      chainResult: [{ data: [], error: null }],
    });
    const service = createApplicationService(supabase.client);
    await service.listApplications("user-a");
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("loads the analytics snapshot with exactly one RPC", async () => {
    const snapshot = {
      summary: {
        total: 0,
        active: 0,
        interviews: 0,
        offers: 0,
        applied_denominator: 0,
        upcoming_deadlines: 0,
        interview_rate: null,
        offer_rate: null,
      },
      status_counts: [
        { status: "saved", count: 0 },
        { status: "preparing", count: 0 },
        { status: "applied", count: 0 },
        { status: "interview", count: 0 },
        { status: "offer", count: 0 },
        { status: "rejected", count: 0 },
        { status: "withdrawn", count: 0 },
      ],
      submissions_over_time: [],
      top_skills: [],
      upcoming_deadlines: [],
      recently_updated: [],
      requiring_action: [],
    };
    const supabase = mockSupabase({ rpc: [{ data: snapshot, error: null }] });
    const service = createAnalyticsService(supabase.client);
    await service.getSnapshot("user-a", "2026-08-02");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
