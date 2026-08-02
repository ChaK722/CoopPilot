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

const KEY_A = "e1111111-1111-4111-8111-111111111111";

function ANALYSIS_JSON(hashProfile = "hp", hashApp = "ha") {
  return `'{
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
}

describe("Phase 5 hardening: concurrency, binding, idempotency, atomicity", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appA: string;
  let appB: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "hard-a@example.test");
    userB = await createUser(ctx.admin, "hard-b@example.test");

    const appOf = (user: string, company: string) =>
      asUser(
        ctx.port,
        user,
        `select public.create_application(
           '${user}', gen_random_uuid(), '${company}', 'Role', null, null, null, null, null,
           null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
         )`,
      );
    appA = (await appOf(userA, "Alpha Co")).rows[0].create_application;
    appB = (await appOf(userB, "Beta Co")).rows[0].create_application;
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  async function createRun(user: string, app: string | null, operation: string, key: string) {
    const appSql = app === null ? "null" : `'${app}'`;
    return asUser(
      ctx.port,
      user,
      `select * from public.create_ai_run('${user}', ${appSql}, '${operation}', '${key}', 'demo')`,
    );
  }

  it("rejects runs for another user's application", async () => {
    const result = await createRun(userB, appA, "match_analysis", KEY_A);
    expect(result.rows[0].created).toBe(false);
    expect(result.rows[0].status).toBe("not_found");
  });

  it("requires an application for non-extraction operations", async () => {
    await expect(createRun(userA, null, "match_analysis", KEY_A)).rejects.toThrow(
      /application is required/i,
    );
  });

  it("requires a null application for job_extraction", async () => {
    await expect(createRun(userA, appA, "job_extraction", KEY_A)).rejects.toThrow(
      /must not reference an application/i,
    );
  });

  it("returns created=true then false for sequential duplicate keys", async () => {
    const key = "e2222222-2222-4222-8222-222222222222";
    const first = await createRun(userA, appA, "match_analysis", key);
    expect(first.rows[0].created).toBe(true);
    expect(first.rows[0].status).toBe("running");
    const second = await createRun(userA, appA, "match_analysis", key);
    expect(second.rows[0].created).toBe(false);
    expect(second.rows[0].id).toBe(first.rows[0].id);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.ai_runs where user_id = '${userA}' and operation = 'match_analysis' and idempotency_key = '${key}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("is concurrency-safe: two parallel calls with one key create one run", async () => {
    const key = "e3333333-3333-4333-8333-333333333333";
    const [first, second] = await Promise.all([
      createRun(userA, appA, "cover_letter", key),
      createRun(userA, appA, "cover_letter", key),
    ]);
    const createdFlags = [first.rows[0].created, second.rows[0].created].filter(Boolean);
    expect(createdFlags).toHaveLength(1);
    expect(first.rows[0].id).toBe(second.rows[0].id);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.ai_runs where idempotency_key = '${key}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("prevents writing match results for a different application than the run", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "e4444444-4444-4444-8444-444444444444",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_match_analysis('${userA}', '${appB}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
      ),
    ).rejects.toThrow(/application_mismatch/i);
  });

  it("prevents writing cover letters for a different application than the run", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "e5555555-5555-4555-8555-555555555555",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_generation('${userA}', '${appB}', '${run.rows[0].id}', 'Draft', 'demo')`,
      ),
    ).rejects.toThrow(/application_mismatch/i);
  });

  it("prevents a cover_letter run from writing interview prep", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "e6666666-6666-4666-8666-666666666666",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
           '${userA}', '${appA}', '${run.rows[0].id}', 'demo',
           '{"questions":[]}', '{"questions":[]}', '{"items":[]}'
         )`,
      ),
    ).rejects.toThrow(/operation_mismatch/i);
  });

  it("prevents an interview_prep run from writing a cover letter", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "e7777777-7777-4777-8777-777777777777",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_generation('${userA}', '${appA}', '${run.rows[0].id}', 'Draft', 'demo')`,
      ),
    ).rejects.toThrow(/operation_mismatch/i);
  });

  it("rejects a mode mismatch", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "e8888888-8888-4888-8888-888888888888",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_match_analysis('${userA}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'external')`,
      ),
    ).rejects.toThrow(/mode_mismatch/i);
  });

  it("rejects writing results for a failed run", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "e9999999-9999-4999-8999-999999999999",
    );
    await asUser(
      ctx.port,
      userA,
      `select public.complete_ai_run('${userA}', '${run.rows[0].id}', 'failed', 'provider down')`,
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_match_analysis('${userA}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
      ),
    ).rejects.toThrow(/invalid run state/i);
  });

  it("returns the existing result instead of a second snapshot for a succeeded run", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const first = await asUser(
      ctx.port,
      userA,
      `select public.insert_match_analysis('${userA}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
    );
    const second = await asUser(
      ctx.port,
      userA,
      `select public.insert_match_analysis('${userA}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
    );
    expect(first.rows[0].insert_match_analysis).toBe(second.rows[0].insert_match_analysis);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.match_analyses where ai_run_id = '${run.rows[0].id}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("returns the existing version for a succeeded cover letter run", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    const first = await asUser(
      ctx.port,
      userA,
      `select public.insert_cover_letter_generation('${userA}', '${appA}', '${run.rows[0].id}', 'Draft', 'demo')`,
    );
    const second = await asUser(
      ctx.port,
      userA,
      `select public.insert_cover_letter_generation('${userA}', '${appA}', '${run.rows[0].id}', 'Draft', 'demo')`,
    );
    expect(first.rows[0].insert_cover_letter_generation).toBe(
      second.rows[0].insert_cover_letter_generation,
    );
    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents where ai_run_id = '${run.rows[0].id}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("keeps one result per type for a repeated interview prep run", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "eccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    const bundle = `select public.insert_interview_prep_bundle(
      '${userA}', '${appA}', '${run.rows[0].id}', 'demo',
      '{"questions":[{"question":"Q"}]}',
      '{"questions":[{"question":"T"}]}',
      '{"items":["R"]}'
    )`;
    await asUser(ctx.port, userA, bundle);
    await asUser(ctx.port, userA, bundle);

    const counts = await asUser(
      ctx.port,
      userA,
      `select document_type, count(*) from public.generated_documents
       where ai_run_id = '${run.rows[0].id}' group by document_type order by document_type`,
    );
    expect(counts.rows).toHaveLength(3);
    for (const row of counts.rows) {
      expect(row.count).toBe("1");
    }
  });

  it("commits the full interview prep bundle atomically", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "eddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    await asUser(
      ctx.port,
      userA,
      `select public.insert_interview_prep_bundle(
        '${userA}', '${appA}', '${run.rows[0].id}', 'demo',
        '{"questions":[{"question":"Q"}]}',
        '{"questions":[{"question":"T"}]}',
        '{"items":["R"]}'
      )`,
    );
    const parts = await asUser(
      ctx.port,
      userA,
      `select document_type from public.generated_documents where ai_run_id = '${run.rows[0].id}'`,
    );
    expect(parts.rows.map((row) => row.document_type).sort()).toEqual([
      "behavioural_questions",
      "research_checklist",
      "technical_questions",
    ]);
    const runState = await asUser(
      ctx.port,
      userA,
      `select status from public.ai_runs where id = '${run.rows[0].id}'`,
    );
    expect(runState.rows[0].status).toBe("succeeded");
  });

  it("rolls back all three parts when any payload is invalid", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
          '${userA}', '${appA}', '${run.rows[0].id}', 'demo',
          '{"questions":[{"question":"Q"}]}',
          '{"questions":[{"question":"T"}]}',
          '[]'
        )`,
      ),
    ).rejects.toThrow(/all three parts must be JSON objects/i);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents where ai_run_id = '${run.rows[0].id}'`,
    );
    expect(count.rows[0].count).toBe("0");
    const runState = await asUser(
      ctx.port,
      userA,
      `select status from public.ai_runs where id = '${run.rows[0].id}'`,
    );
    expect(runState.rows[0].status).toBe("running");
  });

  it("assigns unique consecutive versions under concurrent cover letter edits", async () => {
    const [v1, v2] = await Promise.all([
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_revision('${userA}', '${appA}', 'Edit one', 'edited')`,
      ),
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_revision('${userA}', '${appA}', 'Edit two', 'edited')`,
      ),
    ]);
    const versions = [
      v1.rows[0].insert_cover_letter_revision,
      v2.rows[0].insert_cover_letter_revision,
    ];
    expect(new Set(versions).size).toBe(2);
    expect(Math.abs(versions[0] - versions[1])).toBe(1);
  });

  it("restore creates a new version without touching history", async () => {
    const before = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents
       where application_id = '${appA}' and document_type = 'cover_letter'`,
    );
    await asUser(
      ctx.port,
      userA,
      `select public.insert_cover_letter_revision('${userA}', '${appA}', 'Restored draft', 'restored')`,
    );
    const after = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents
       where application_id = '${appA}' and document_type = 'cover_letter'`,
    );
    expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
  });

  it("enforces ai_run_id partial uniqueness", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "ef4f4f4f-4f4f-4f4f-8f4f-4f4f4f4f4f4f",
    );
    await asUser(
      ctx.port,
      userA,
      `select public.insert_match_analysis('${userA}', '${appA}', '${run.rows[0].id}', ${ANALYSIS_JSON()}, 'demo')`,
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.match_analyses (
           user_id, application_id, ai_run_id, overall_score, score_breakdown,
           profile_source_hash, application_source_hash, generation_mode
         ) values (
           '${userA}', '${appA}', '${run.rows[0].id}', 50, '{}', 'hp', 'ha', 'demo'
         )`,
      ),
    ).rejects.toThrow(/row-level security|permission denied|unique/i);
  });
});
