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

// Phase 7: automated catalog audit of every public security-definer RPC.

const GRANTED_TO_AUTHENTICATED = new Set([
  "handle_new_user",
  "replace_profile_skills",
  "swap_sort_order",
  "create_application",
  "duplicate_application",
  "update_application_status",
  "create_ai_run",
  "complete_ai_run",
  "insert_match_analysis",
  "insert_cover_letter_generation",
  "insert_cover_letter_revision",
  "insert_interview_prep_bundle",
  "save_job_extraction_result",
  "get_application_analytics",
  "get_board_match_scores",
  "search_application_ids",
]);

// Functions that must never be callable by ordinary roles.
const RETIRED_OR_INTERNAL = new Set(["lock_ai_run", "insert_generated_document"]);

describe("Phase 7 security-definer RPC audit", () => {
  let ctx: TestPostgres;
  let userA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await ctx.admin.query(`create role public_only_probe nologin`);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "rpc-audit@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  async function definerFunctions() {
    const { rows } = await ctx.admin.query(`
      select p.oid::regprocedure::text as signature,
             p.proname,
             p.proconfig,
             p.prosrc,
             p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
      order by p.proname, p.oid::regprocedure::text
    `);
    return rows;
  }

  it("every public security-definer function pins search_path and uses no dynamic SQL", async () => {
    const rows = await definerFunctions();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const config = row.proconfig ?? [];
      expect(
        config.some((entry: string) => entry === "search_path=public"),
        `${row.signature} must pin search_path`,
      ).toBe(true);
      expect(row.prosrc, `${row.signature} must not use dynamic SQL`).not.toMatch(
        /\bEXECUTE\s+(format|'|\$)/i,
      );
      expect(row.prosecdef).toBe(true);
    }
  });

  it("PUBLIC and anon have no EXECUTE on any security-definer RPC", async () => {
    const rows = await definerFunctions();
    for (const row of rows) {
      for (const role of ["public_only_probe", "anon"]) {
        const { rows: check } = await ctx.admin.query(
          `select has_function_privilege($1, $2, 'EXECUTE') as granted`,
          [role, row.signature],
        );
        expect(check[0].granted, `${role} should not execute ${row.signature}`).toBe(false);
      }
    }
  });

  it("matches the designed authenticated ACL for every security-definer RPC", async () => {
    const rows = await definerFunctions();
    for (const row of rows) {
      const { rows: check } = await ctx.admin.query(
        `select has_function_privilege('authenticated', $1, 'EXECUTE') as granted`,
        [row.signature],
      );
      const expected = GRANTED_TO_AUTHENTICATED.has(row.proname);
      expect(check[0].granted, `${row.signature} authenticated EXECUTE should be ${expected}`).toBe(
        expected,
      );
    }
  });

  it("retired and internal RPCs are actually denied to authenticated callers", async () => {
    const rows = await definerFunctions();
    const retired = rows.filter((row) => RETIRED_OR_INTERNAL.has(row.proname));
    expect(retired.map((row) => row.proname).sort()).toEqual([...RETIRED_OR_INTERNAL].sort());
    for (const row of retired) {
      const { rows: check } = await ctx.admin.query(
        `select has_function_privilege('authenticated', $1, 'EXECUTE') as granted`,
        [row.signature],
      );
      expect(check[0].granted).toBe(false);
    }
  });

  it("every definer RPC except the auth trigger checks auth.uid() identity", async () => {
    const rows = await definerFunctions();
    for (const row of rows) {
      if (row.proname === "handle_new_user") continue; // auth.users insert trigger
      expect(row.prosrc, `${row.signature} must verify auth.uid()`).toMatch(/auth\.uid\(\)/i);
    }
  });

  it("rejects a forged p_user_id on the new search RPC", async () => {
    await expect(
      asUser(
        ctx.port,
        userA,
        `select * from public.search_application_ids(
           '00000000-0000-0000-0000-000000000000', 'x'
         )`,
      ),
    ).rejects.toThrow(/not allowed/i);
  });
});
