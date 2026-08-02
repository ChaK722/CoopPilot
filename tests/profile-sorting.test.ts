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

const TABLES = ["educations", "experiences", "projects"] as const;

function insertSql(table: string, userId: string, label: string): string {
  switch (table) {
    case "educations":
      return `insert into public.educations (user_id, school, degree, program)
              values ('${userId}', 'School ${label}', 'Degree', 'Program') returning id, sort_order`;
    case "experiences":
      return `insert into public.experiences (user_id, title, organization)
              values ('${userId}', 'Title ${label}', 'Org') returning id, sort_order`;
    case "projects":
      return `insert into public.projects (user_id, name)
              values ('${userId}', 'Project ${label}') returning id, sort_order`;
  }
  throw new Error(`unknown table ${table}`);
}

describe("Phase 2 sorting: create, reorder, persist", () => {
  let ctx: TestPostgres;
  let userA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "sort@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  for (const table of TABLES) {
    describe(table, () => {
      it("assigns sequential sort_order to newly created records", async () => {
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
          const result = await asUser(ctx.port, userA, insertSql(table, userA, `A${i}`));
          expect(result.rows[0].sort_order).toBe(i);
          ids.push(result.rows[0].id);
        }

        const list = await asUser(
          ctx.port,
          userA,
          `select id, sort_order from public.${table} where user_id = '${userA}' order by sort_order`,
        );
        expect(list.rows.map((row) => row.id)).toEqual(ids);
        expect(list.rows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
      });

      it("swaps two records transactionally and persists the order", async () => {
        const before = await asUser(
          ctx.port,
          userA,
          `select id from public.${table} where user_id = '${userA}' order by sort_order`,
        );
        const [first, second, third] = before.rows;
        expect(before.rows).toHaveLength(3);

        const swap = await asUser(
          ctx.port,
          userA,
          `select public.swap_sort_order('${table}', '${first.id}', '${second.id}', '${userA}')`,
        );
        expect(swap.rows[0].swap_sort_order).toBe(true);

        // Fresh connection = refresh; order must persist.
        const after = await asUser(
          ctx.port,
          userA,
          `select id from public.${table} where user_id = '${userA}' order by sort_order`,
        );
        expect(after.rows.map((row) => row.id)).toEqual([second.id, first.id, third.id]);
      });

      it("returns false for missing or foreign records", async () => {
        const missing = await asUser(
          ctx.port,
          userA,
          `select public.swap_sort_order(
             '${table}',
             '00000000-0000-4000-8000-000000000000',
             '00000000-0000-4000-8000-000000000001',
             '${userA}'
           )`,
        );
        expect(missing.rows[0].swap_sort_order).toBe(false);
      });
    });
  }

  it("rejects reordering another user's records", async () => {
    const userB = await createUser(ctx.admin, "sort-b@example.test");
    const aRows = await asUser(
      ctx.port,
      userA,
      `select id from public.educations where user_id = '${userA}' order by sort_order`,
    );
    const result = await asUser(
      ctx.port,
      userB,
      `select public.swap_sort_order(
         'educations',
         '${aRows.rows[0].id}',
         '${aRows.rows[1].id}',
         '${userB}'
       )`,
    );
    expect(result.rows[0].swap_sort_order).toBe(false);
  });
});
