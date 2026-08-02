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
  let appA2: string;

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
    appA2 = (await appOf(userA, "Alpha Second Co")).rows[0].create_application;
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  async function createRun(
    user: string,
    app: string | null,
    operation: string,
    key: string,
    mode = "demo",
  ) {
    const appSql = app === null ? "null" : `'${app}'`;
    return asUser(
      ctx.port,
      user,
      `select * from public.create_ai_run('${user}', ${appSql}, '${operation}', '${key}', '${mode}')`,
    );
  }

  async function nextDocumentVersion(
    admin: typeof ctx.admin,
    appId: string,
    documentType: string,
  ): Promise<number> {
    const { rows } = await admin.query(
      `select coalesce(max(version), 0) + 1 as v
       from public.generated_documents
       where application_id = $1 and document_type = $2`,
      [appId, documentType],
    );
    return Number(rows[0].v);
  }

  async function bindDocument(
    admin: typeof ctx.admin,
    userId: string,
    appId: string,
    runId: string,
    documentType: string,
    version: number,
    contentJson: string,
  ) {
    await admin.query(
      `insert into public.generated_documents (
         user_id, application_id, ai_run_id, document_type, version, content_json,
         generation_mode, user_edited
       ) values ($1, $2, $3, $4, $5, $6::jsonb, 'demo', false)`,
      [userId, appId, runId, documentType, version, contentJson],
    );
  }

  it("rejects runs for another user's application", async () => {
    const result = await createRun(userB, appA, "match_analysis", KEY_A);
    expect(result.rows[0].created).toBe(false);
    expect(result.rows[0].status).toBe("not_found");
    expect(result.rows[0].id).toBeNull();
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

  it("rejects an idempotency key reused for a different application", async () => {
    const key = "f1111111-1111-4111-8111-111111111111";
    const first = await createRun(userA, appA, "match_analysis", key);
    expect(first.rows[0].created).toBe(true);

    await expect(createRun(userA, appA2, "match_analysis", key)).rejects.toThrow(
      /idempotency key conflicts with a different request/i,
    );

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.ai_runs where idempotency_key = '${key}'`,
    );
    expect(count.rows[0].count).toBe("1");
    const secondAppRuns = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.ai_runs where application_id = '${appA2}'`,
    );
    expect(secondAppRuns.rows[0].count).toBe("0");
  });

  it("rejects an idempotency key reused with a different generation mode", async () => {
    const key = "f2222222-2222-4222-8222-222222222222";
    const first = await createRun(userA, appA, "cover_letter", key, "demo");
    expect(first.rows[0].created).toBe(true);

    await expect(createRun(userA, appA, "cover_letter", key, "external")).rejects.toThrow(
      /idempotency key conflicts with a different request/i,
    );

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.ai_runs where idempotency_key = '${key}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("scopes idempotency keys per operation so cross-operation reuse cannot corrupt results", async () => {
    const key = "f2345678-2345-4234-8234-234523452345";
    const extraction = await createRun(userA, null, "job_extraction", key);
    expect(extraction.rows[0].created).toBe(true);

    // The unique key is (user_id, operation, idempotency_key), so the same
    // key under a different operation creates a separate run instead of
    // reusing the job-extraction result.
    const match = await createRun(userA, appA, "match_analysis", key);
    expect(match.rows[0].created).toBe(true);
    expect(match.rows[0].id).not.toBe(extraction.rows[0].id);

    const runs = await asUser(
      ctx.port,
      userA,
      `select operation from public.ai_runs where idempotency_key = '${key}' order by operation`,
    );
    expect(runs.rows.map((row) => row.operation)).toEqual(["job_extraction", "match_analysis"]);
  });

  it("concurrent same-key requests for different applications fail instead of reusing the winner", async () => {
    const key = "f3333333-3333-4333-8333-333333333333";
    const [first, second] = await Promise.allSettled([
      createRun(userA, appA, "match_analysis", key),
      createRun(userA, appA2, "match_analysis", key),
    ]);
    const fulfilled = first.status === "fulfilled" ? first : second;
    const rejected = first.status === "rejected" ? first : second;

    expect(fulfilled.status).toBe("fulfilled");
    if (fulfilled.status !== "fulfilled") return;
    expect(fulfilled.value.rows[0].created).toBe(true);

    expect(rejected.status).toBe("rejected");
    if (rejected.status !== "rejected") return;
    expect(String(rejected.reason)).toMatch(/idempotency key conflicts with a different request/i);

    const runs = await asUser(
      ctx.port,
      userA,
      `select application_id from public.ai_runs where idempotency_key = '${key}'`,
    );
    expect(runs.rows).toHaveLength(1);
  });

  it("rejects saving a match for a succeeded run with no bound result", async () => {
    const run = await createRun(
      userA,
      appA,
      "match_analysis",
      "f4444444-4444-4444-8444-444444444444",
    );
    const runId = run.rows[0].id;
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_match_analysis('${userA}', '${appA}', '${runId}', ${ANALYSIS_JSON()}, 'demo')`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: match result missing/i);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.match_analyses where ai_run_id = '${runId}'`,
    );
    expect(count.rows[0].count).toBe("0");
  });

  it("rejects saving a cover letter for a succeeded run with no bound document", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "f5555555-5555-4555-8555-555555555555",
    );
    const runId = run.rows[0].id;
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_generation('${userA}', '${appA}', '${runId}', 'Draft', 'demo')`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: cover letter result missing/i);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents where ai_run_id = '${runId}'`,
    );
    expect(count.rows[0].count).toBe("0");
  });

  it("rejects a succeeded interview prep run bound only to behavioural questions", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "f6666666-6666-4666-8666-666666666666",
    );
    const runId = run.rows[0].id;
    const version = await nextDocumentVersion(ctx.admin, appA, "behavioural_questions");
    await bindDocument(
      ctx.admin,
      userA,
      appA,
      runId,
      "behavioural_questions",
      version,
      '{"questions":[]}',
    );
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
          '${userA}', '${appA}', '${runId}', 'demo',
          '{"questions":[{"question":"Q"}]}',
          '{"questions":[{"question":"T"}]}',
          '{"items":["R"]}'
        )`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: interview prep bundle incomplete/i);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.generated_documents where ai_run_id = '${runId}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("rejects a succeeded interview prep run missing the research checklist", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "f6677777-6677-4667-8667-667766776677",
    );
    const runId = run.rows[0].id;
    for (const type of ["behavioural_questions", "technical_questions"]) {
      const version = await nextDocumentVersion(ctx.admin, appA, type);
      await bindDocument(ctx.admin, userA, appA, runId, type, version, '{"questions":[]}');
    }
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
          '${userA}', '${appA}', '${runId}', 'demo',
          '{"questions":[{"question":"Q"}]}',
          '{"questions":[{"question":"T"}]}',
          '{"items":["R"]}'
        )`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: interview prep bundle incomplete/i);
  });

  it("rejects a succeeded interview prep run bound to a wrong document type", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "f6688888-6688-4668-8668-668866886688",
    );
    const runId = run.rows[0].id;
    const bindings = [
      ["behavioural_questions", '{"questions":[]}'],
      ["technical_questions", '{"questions":[]}'],
      ["cover_letter", '"wrong type"'],
    ] as const;
    for (const [type, content] of bindings) {
      const version = await nextDocumentVersion(ctx.admin, appA, type);
      await bindDocument(ctx.admin, userA, appA, runId, type, version, content);
    }
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
          '${userA}', '${appA}', '${runId}', 'demo',
          '{"questions":[{"question":"Q"}]}',
          '{"questions":[{"question":"T"}]}',
          '{"items":["R"]}'
        )`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: interview prep bundle incomplete/i);
  });

  it("rejects a succeeded job extraction run with a null result", async () => {
    const run = await createRun(
      userA,
      null,
      "job_extraction",
      "f6699999-6699-4669-8669-669966996699",
    );
    const runId = run.rows[0].id;
    await ctx.admin.query(
      `update public.ai_runs set status = 'succeeded', completed_at = now() where id = $1`,
      [runId],
    );

    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.save_job_extraction_result('${userA}', '${runId}', '{"company":"Acme"}'::jsonb)`,
      ),
    ).rejects.toThrow(/inconsistent succeeded run: extraction result missing/i);

    const state = await asUser(
      ctx.port,
      userA,
      `select result_json from public.ai_runs where id = '${runId}'`,
    );
    expect(state.rows[0].result_json).toBeNull();
  });

  it("requires non-empty cover letter generation content", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "f6700000-6700-4670-8670-670067006700",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_generation('${userA}', '${appA}', '${run.rows[0].id}', '   ', 'demo')`,
      ),
    ).rejects.toThrow(/cover letter content is required/i);
  });

  it("rejects cover letter generation content over 50,000 characters", async () => {
    const run = await createRun(
      userA,
      appA,
      "cover_letter",
      "f6711111-6711-4671-8671-671167116711",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_generation(
          '${userA}', '${appA}', '${run.rows[0].id}', repeat('x', 50001), 'demo'
        )`,
      ),
    ).rejects.toThrow(/cover letter content is too long/i);
  });

  it("requires non-empty revision content", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_cover_letter_revision('${userA}', '${appA}', '', 'edited')`,
      ),
    ).rejects.toThrow(/cover letter content is required/i);
  });

  it("rejects interview prep parts that omit their required array fields", async () => {
    const run = await createRun(
      userA,
      appA,
      "interview_prep",
      "f6722222-6722-4672-8672-672267226722",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_interview_prep_bundle(
          '${userA}', '${appA}', '${run.rows[0].id}', 'demo',
          '{}', '{}', '{}'
        )`,
      ),
    ).rejects.toThrow(/all three parts must include their required array fields/i);
  });

  it("rejects a non-object job extraction result", async () => {
    const run = await createRun(
      userA,
      null,
      "job_extraction",
      "f6733333-6733-4673-8673-673367336733",
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.save_job_extraction_result('${userA}', '${run.rows[0].id}', '[]'::jsonb)`,
      ),
    ).rejects.toThrow(/result must be a JSON object/i);
  });
});
