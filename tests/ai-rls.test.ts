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

describe("Phase 5 AI tables: RLS and RPCs", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "ai-a@example.test");
    userB = await createUser(ctx.admin, "ai-b@example.test");

    const created = await asUser(
      ctx.port,
      userA,
      `select public.create_application(
         '${userA}', gen_random_uuid(), 'Acme', 'Intern', null, null, null, null, null,
         null, null, '{}', null, null, 'Job text', '{}', '{}',
         '[{"requirement_type":"required","name":"TypeScript","normalized_name":"typescript","sort_order":0}]'::jsonb,
         'saved'
       )`,
    );
    appA = created.rows[0].create_application;
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  const ANALYSIS_JSON = (hashProfile = "hp", hashApp = "ha") =>
    `'{
      "overall_score": 70,
      "score_breakdown": {
        "required_skills": {"score": 40, "max": 40, "explanation": "hit"},
        "preferred_skills": {"score": 0, "max": 20, "explanation": "miss"},
        "relevant_experience": {"score": 20, "max": 20, "explanation": "yes"},
        "education": {"score": 10, "max": 10, "explanation": "yes"},
        "location_availability": {"score": 0, "max": 10, "explanation": "no"}
      },
      "matching_skills": [{"name": "TypeScript", "evidence": "profile"}],
      "missing_required_skills": [],
      "missing_preferred_skills": ["AWS"],
      "matching_experience": [],
      "relevant_projects": [],
      "keywords": ["TypeScript"],
      "suggestions": ["Highlight real results"],
      "profile_source_hash": "${hashProfile}",
      "application_source_hash": "${hashApp}"
    }'::jsonb`;

  it("enables RLS on all three AI tables", async () => {
    const { rows } = await ctx.admin.query(
      `select relname from pg_class
       where relname in ('ai_runs', 'match_analyses', 'generated_documents')
         and relrowsecurity = true
       order by relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([
      "ai_runs",
      "generated_documents",
      "match_analyses",
    ]);
  });

  it("creates an idempotent ai_run and rejects foreign users", async () => {
    const key = "d1111111-1111-4111-8111-111111111111";
    const first = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'match_analysis', '${key}', 'demo')`,
    );
    expect(first.rows[0].status).toBe("running");
    const runId = first.rows[0].id;

    const second = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'match_analysis', '${key}', 'demo')`,
    );
    expect(second.rows[0].id).toBe(runId);

    await expect(
      asUser(
        ctx.port,
        userB,
        `select * from public.create_ai_run('${userA}', '${appA}', 'match_analysis', '${key}', 'demo')`,
      ),
    ).rejects.toThrow(/not allowed/i);
  });

  it("rejects invalid operations before touching data", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `select * from public.create_ai_run('${userA}', '${appA}', 'bogus', gen_random_uuid(), 'demo')`,
      ),
    ).rejects.toThrow(/invalid operation/i);
  });

  it("inserts a match snapshot only for the owner's run and marks it succeeded", async () => {
    const key = "d2222222-2222-4222-8222-222222222222";
    const run = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'match_analysis', '${key}', 'demo')`,
    );
    const runId = run.rows[0].id;

    const inserted = await asUser(
      ctx.port,
      userA,
      `select public.insert_match_analysis('${userA}', '${appA}', '${runId}', ${ANALYSIS_JSON()}, 'demo')`,
    );
    expect(inserted.rows[0].insert_match_analysis).toBeTruthy();

    const runState = await asUser(
      ctx.port,
      userA,
      `select status from public.ai_runs where id = '${runId}'`,
    );
    expect(runState.rows[0].status).toBe("succeeded");

    const match = await asUser(
      ctx.port,
      userA,
      `select overall_score from public.match_analyses where application_id = '${appA}'`,
    );
    expect(match.rows[0].overall_score).toBe(70);
  });

  it("returns null for a run that does not belong to the caller", async () => {
    const key = "d3333333-3333-4333-8333-333333333333";
    const run = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'match_analysis', '${key}', 'demo')`,
    );
    const result = await asUser(
      ctx.port,
      userB,
      `select public.insert_match_analysis('${userB}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
    );
    expect(result.rows[0].insert_match_analysis).toBeNull();
  });

  it("increments document versions per application and type", async () => {
    const key = "d4444444-4444-4444-8444-444444444444";
    const run = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'cover_letter', '${key}', 'demo')`,
    );
    const runId = run.rows[0].id;

    const v1 = await asUser(
      ctx.port,
      userA,
      `select public.insert_cover_letter_generation(
         '${userA}', '${appA}', '${runId}', 'Draft one', 'demo'
       )`,
    );
    expect(v1.rows[0].insert_cover_letter_generation).toBe(1);

    const key2 = "d5555555-5555-4555-8555-555555555555";
    const run2 = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run('${userA}', '${appA}', 'cover_letter', '${key2}', 'demo')`,
    );
    const v2 = await asUser(
      ctx.port,
      userA,
      `select public.insert_cover_letter_generation(
         '${userA}', '${appA}', '${run2.rows[0].id}', 'Draft two', 'demo'
       )`,
    );
    expect(v2.rows[0].insert_cover_letter_generation).toBe(2);

    const versions = await asUser(
      ctx.port,
      userA,
      `select version, content_text from public.generated_documents
       where application_id = '${appA}' and document_type = 'cover_letter' order by version`,
    );
    expect(versions.rows.map((row) => row.content_text)).toEqual(["Draft one", "Draft two"]);
  });

  it("prevents ordinary users from writing AI tables directly", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.ai_runs
           (user_id, application_id, operation, idempotency_key, generation_mode)
         values ('${userA}', '${appA}', 'match_analysis', gen_random_uuid(), 'demo')`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);

    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.match_analyses
           (user_id, application_id, overall_score, score_breakdown,
            profile_source_hash, application_source_hash, generation_mode)
         values ('${userA}', '${appA}', 50, '{}', 'hp', 'ha', 'demo')`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);

    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.generated_documents
           (user_id, application_id, document_type, version, content_text, generation_mode)
         values ('${userA}', '${appA}', 'cover_letter', 99, 'x', 'demo')`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("isolates AI data between users", async () => {
    const readB = await asUser(ctx.port, userB, "select * from public.match_analyses");
    expect(readB.rows.every((row) => row.user_id === userB)).toBe(true);
    expect(readB.rows).toHaveLength(0);
  });
});
