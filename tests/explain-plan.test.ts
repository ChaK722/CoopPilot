import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyMigrations,
  asUser,
  bootstrapAuthShim,
  createUser,
  startTestPostgres,
  type TestPostgres,
} from "@/tests/db/helpers";

// Phase 7: verify the analytics/board indexes exist and capture EXPLAIN
// plans for the core queries. Plans are recorded in docs/performance-audit.md.

describe("Phase 7 EXPLAIN and index audit", () => {
  let ctx: TestPostgres;
  let userA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "explain@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("creates the designed analytics and status-history indexes", async () => {
    const { rows } = await ctx.admin.query(`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'applications_owner_status_idx',
          'applications_owner_deadline_idx',
          'applications_owner_updated_idx',
          'applications_owner_date_applied_idx',
          'application_skills_owner_normalized_idx',
          'application_status_events_user_to_changed_idx',
          'application_status_events_user_to_idx',
          'match_analyses_application_generated_idx',
          'generated_documents_application_type_version_idx'
        )
      order by indexname
    `);
    expect(rows.map((row) => row.indexname)).toEqual([
      "application_skills_owner_normalized_idx",
      "application_status_events_user_to_changed_idx",
      "application_status_events_user_to_idx",
      "applications_owner_date_applied_idx",
      "applications_owner_deadline_idx",
      "applications_owner_status_idx",
      "applications_owner_updated_idx",
      "generated_documents_application_type_version_idx",
      "match_analyses_application_generated_idx",
    ]);
  });

  it("produces valid EXPLAIN plans for the core queries", async () => {
    const queries: Record<string, string> = {
      board: `
        select * from public.applications
        where user_id = '${userA}' and archived_at is null
        order by updated_at desc, id asc limit 200`,
      analytics_base: `
        select id, status from public.applications
        where user_id = '${userA}' and archived_at is null`,
      upcoming: `
        select id from public.applications
        where user_id = '${userA}' and archived_at is null
          and status in ('saved', 'preparing')
          and deadline between '2026-08-02' and '2026-08-09'`,
      funnel: `
        select distinct application_id from public.application_status_events
        where user_id = '${userA}' and to_status = 'interview'`,
      latest_match: `
        select distinct on (application_id) application_id, overall_score
        from public.match_analyses
        where user_id = '${userA}'
        order by application_id, generated_at desc, id desc`,
      document_versions: `
        select version from public.generated_documents
        where application_id = '${"00000000-0000-0000-0000-000000000000"}'
          and document_type = 'cover_letter'
        order by version desc limit 1`,
    };

    const plans: string[] = [];
    for (const [name, sql] of Object.entries(queries)) {
      const { rows } = await ctx.admin.query(`explain ${sql}`);
      const plan = rows.map((row) => String(row["QUERY PLAN"])).join("\n");
      expect(plan.length).toBeGreaterThan(0);
      plans.push(`--- ${name} ---\n${plan}`);
    }
    writeFileSync(join(process.cwd(), ".tmp-explain.txt"), plans.join("\n\n"));
  });

  it("returns bounded results for every analytics list", async () => {
    const result = await asUser(
      ctx.port,
      userA,
      `select public.get_application_analytics('${userA}', '2026-08-02') as snap`,
    );
    const snap = result.rows[0].snap as Record<string, unknown>;
    expect((snap.upcoming_deadlines as unknown[]).length).toBeLessThanOrEqual(5);
    expect((snap.recently_updated as unknown[]).length).toBeLessThanOrEqual(5);
    expect((snap.requiring_action as unknown[]).length).toBeLessThanOrEqual(5);
    expect((snap.top_skills as unknown[]).length).toBeLessThanOrEqual(10);
  });
});
