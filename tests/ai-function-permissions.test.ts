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

// Phase 5 hardening 000007: explicit function ACLs. PostgreSQL defaults to
// PUBLIC EXECUTE on new functions, so the ACL matrix below must prove that
// PUBLIC, anon, and authenticated no longer execute the retired helper RPCs,
// while the seven entry-point RPCs remain callable by authenticated users.

const ENTRY_SIGNATURES = [
  "create_ai_run(uuid, uuid, text, uuid, text)",
  "complete_ai_run(uuid, uuid, text, text)",
  "insert_match_analysis(uuid, uuid, uuid, jsonb, text)",
  "insert_cover_letter_generation(uuid, uuid, uuid, text, text)",
  "insert_cover_letter_revision(uuid, uuid, text, text)",
  "insert_interview_prep_bundle(uuid, uuid, uuid, text, jsonb, jsonb, jsonb)",
  "save_job_extraction_result(uuid, uuid, jsonb)",
];

const INTERNAL_SIGNATURES = [
  "lock_ai_run(uuid, uuid, uuid, text, text)",
  "insert_generated_document(uuid, uuid, text, text, jsonb, text, boolean, uuid)",
];

const ALL_SIGNATURES = [...ENTRY_SIGNATURES, ...INTERNAL_SIGNATURES];

describe("Phase 5 function permission hardening", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    // A role with no direct grants models "PUBLIC-only" access: any execute
    // it has can only come from the PUBLIC ACL entry on the function.
    await ctx.admin.query(`create role public_only_probe nologin`);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "perm-a@example.test");
    userB = await createUser(ctx.admin, "perm-b@example.test");

    const created = await asUser(
      ctx.port,
      userA,
      `select public.create_application(
         '${userA}', gen_random_uuid(), 'Perm Co', 'Intern', null, null, null, null, null,
         null, null, '{}', null, null, 'Job text', '{}', '{}',
         '[]'::jsonb, 'saved'
       )`,
    );
    appA = created.rows[0].create_application;
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  async function hasExecute(role: string, signature: string): Promise<boolean> {
    const { rows } = await ctx.admin.query(
      `select has_function_privilege($1, $2, 'EXECUTE') as granted`,
      [role, signature],
    );
    return rows[0].granted;
  }

  it("revokes PUBLIC EXECUTE from the retired insert_generated_document", async () => {
    // public_only_probe inherits only the PUBLIC ACL entry, so a false here
    // proves PUBLIC has no effective EXECUTE.
    expect(await hasExecute("public_only_probe", INTERNAL_SIGNATURES[1])).toBe(false);
  });

  it("revokes authenticated EXECUTE from the retired insert_generated_document", async () => {
    expect(await hasExecute("authenticated", INTERNAL_SIGNATURES[1])).toBe(false);
  });

  it("revokes anon EXECUTE from the retired insert_generated_document", async () => {
    expect(await hasExecute("anon", INTERNAL_SIGNATURES[1])).toBe(false);
  });

  it("revokes authenticated EXECUTE from lock_ai_run", async () => {
    expect(await hasExecute("authenticated", INTERNAL_SIGNATURES[0])).toBe(false);
  });

  it("revokes anon EXECUTE from lock_ai_run", async () => {
    expect(await hasExecute("anon", INTERNAL_SIGNATURES[0])).toBe(false);
  });

  it("keeps EXECUTE for authenticated on every entry-point RPC", async () => {
    for (const signature of ENTRY_SIGNATURES) {
      expect(await hasExecute("authenticated", signature)).toBe(true);
    }
  });

  it("revokes PUBLIC EXECUTE from every Phase 5 AI RPC", async () => {
    for (const signature of ALL_SIGNATURES) {
      expect(await hasExecute("public_only_probe", signature)).toBe(false);
    }
  });

  it("denies authenticated callers of the retired insert_generated_document", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.insert_generated_document(
           null::uuid, null::uuid, 'cover_letter', 'x', null, 'demo', false, null::uuid
         )`,
      ),
    ).rejects.toThrow(/permission denied for function insert_generated_document/i);
  });

  it("denies authenticated callers of lock_ai_run", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `select public.lock_ai_run(
           null::uuid, null::uuid, null::uuid, 'match_analysis', 'demo'
         )`,
      ),
    ).rejects.toThrow(/permission denied for function lock_ai_run/i);
  });

  it("still allows authenticated users to call entry-point RPCs", async () => {
    const key = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
    const result = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run(
         '${userA}', '${appA}', 'match_analysis', '${key}', 'demo'
       )`,
    );
    expect(result.rows[0].created).toBe(true);
    expect(result.rows[0].status).toBe("running");
  });

  it("lock_ai_run rejects a mismatched auth.uid() even when called by the owner", async () => {
    const key = "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b";
    const run = await asUser(
      ctx.port,
      userA,
      `select * from public.create_ai_run(
         '${userA}', '${appA}', 'match_analysis', '${key}', 'demo'
       )`,
    );
    const runId = run.rows[0].id as string;

    await ctx.admin.query(`select set_config($1, $2, false)`, [
      "request.jwt.claims",
      JSON.stringify({ sub: userA, role: "authenticated" }),
    ]);
    await expect(
      ctx.admin.query(
        `select public.lock_ai_run(
           '${userB}', '${runId}', '${appA}', 'match_analysis', 'demo'
         )`,
      ),
    ).rejects.toThrow(/not allowed/i);
  });
});
