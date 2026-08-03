import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  applyMigrations,
  asUser,
  asUserParams,
  bootstrapAuthShim,
  createUser,
  startTestPostgres,
  type TestPostgres,
} from "@/tests/db/helpers";

// Phase 7: the application search is a parameterized RPC; PostgREST filter
// strings are never built from user input. Malicious characters must not
// expand the query, leak other users' rows, or raise raw database errors.

describe("Phase 7 search injection", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appAcme: string;
  let appBeta: string;
  let appSecret: string;

  async function search(user: string, term: string, requirementType: string | null = null) {
    const result = await asUserParams(
      ctx.port,
      user,
      `select * from public.search_application_ids($1, $2, $3)`,
      [user, term, requirementType],
    );
    return result.rows.map((row) => row.application_id);
  }

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "search-a@example.test");
    userB = await createUser(ctx.admin, "search-b@example.test");

    async function createApp(user: string, company: string) {
      const result = await asUser(
        ctx.port,
        user,
        `select public.create_application(
           '${user}', gen_random_uuid(), '${company}', 'Role', null, null, null, null, null,
           null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
         )`,
      );
      return result.rows[0].create_application;
    }

    appAcme = await createApp(userA, "ACME Corp");
    appBeta = await createApp(userA, "Beta Labs");
    appSecret = await createApp(userB, "Secret Co");

    await asUser(
      ctx.port,
      userA,
      `insert into public.application_skills (
         user_id, application_id, requirement_type, name, normalized_name, sort_order
       ) values ('${userA}', '${appAcme}', 'required', 'C++', 'c++', 0)`,
    );
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("finds matching applications with a normal term", async () => {
    expect(await search(userA, "ACME")).toEqual([appAcme]);
    expect(await search(userA, "beta")).toEqual([appBeta]);
  });

  it("matches skills by name and normalized name", async () => {
    expect(await search(userA, "C++")).toEqual([appAcme]);
    expect(await search(userA, "c++")).toEqual([appAcme]);
  });

  it("escapes LIKE wildcards instead of treating them as patterns", async () => {
    expect(await search(userA, "%")).toEqual([]);
    expect(await search(userA, "_")).toEqual([]);
    expect(await search(userA, "\\")).toEqual([]);
  });

  it.each([",", "(", ")", '"', "'", ";", "--", "OR 1=1", ") OR true --", "name=eq.x"])(
    "never expands the query for malicious term %j",
    async (term) => {
      const ids = await search(userA, term);
      expect(ids.every((id) => id === appAcme || id === appBeta)).toBe(true);
      expect(ids).not.toContain(appSecret);
    },
  );

  it("never returns another user's applications", async () => {
    expect(await search(userA, "Secret")).toEqual([]);
    expect(await search(userB, "ACME")).toEqual([]);
    expect(await search(userB, "Secret")).toEqual([appSecret]);
  });

  it("supports the required-only skill filter without breaking", async () => {
    expect(await search(userA, "c++", "required")).toEqual([appAcme]);
    expect(await search(userA, "c++", "preferred")).toEqual([]);
  });

  it("rejects a forged p_user_id", async () => {
    await expect(
      asUser(ctx.port, userA, `select * from public.search_application_ids('${userB}', 'x')`),
    ).rejects.toThrow(/not allowed/i);
  });
});
