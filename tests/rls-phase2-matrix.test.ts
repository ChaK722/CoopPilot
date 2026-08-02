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

interface TableSpec {
  table: string;
  ownInsert: (userId: string, label: string) => string;
  updateColumn: string;
}

const TABLES: TableSpec[] = [
  {
    table: "educations",
    ownInsert: (userId, label) =>
      `insert into public.educations (user_id, school, degree, program)
       values ('${userId}', 'School ${label}', 'Degree', 'Program')`,
    updateColumn: "school",
  },
  {
    table: "profile_skills",
    ownInsert: (userId, label) =>
      `insert into public.profile_skills (user_id, category, name, normalized_name)
       values ('${userId}', 'tools', 'Skill ${label}', 'skill ${label}')`,
    updateColumn: "name",
  },
  {
    table: "experiences",
    ownInsert: (userId, label) =>
      `insert into public.experiences (user_id, title, organization)
       values ('${userId}', 'Title ${label}', 'Org')`,
    updateColumn: "title",
  },
  {
    table: "projects",
    ownInsert: (userId, label) =>
      `insert into public.projects (user_id, name) values ('${userId}', 'Project ${label}')`,
    updateColumn: "name",
  },
];

describe("Phase 2 RLS matrix: cross-user isolation on all four tables", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "matrix-a@example.test");
    userB = await createUser(ctx.admin, "matrix-b@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  for (const spec of TABLES) {
    describe(spec.table, () => {
      it("allows the owner to insert, read, update, and delete their own rows", async () => {
        await asUser(ctx.port, userA, spec.ownInsert(userA, "own"));
        const read = await asUser(
          ctx.port,
          userA,
          `select * from public.${spec.table} where user_id = '${userA}'`,
        );
        expect(read.rows.length).toBeGreaterThan(0);
        const rowId = read.rows[0].id;

        const update = await asUser(
          ctx.port,
          userA,
          `update public.${spec.table} set ${spec.updateColumn} = 'Updated' where id = '${rowId}'`,
        );
        expect(update.rowCount).toBe(1);

        const del = await asUser(
          ctx.port,
          userA,
          `delete from public.${spec.table} where id = '${rowId}'`,
        );
        expect(del.rowCount).toBe(1);
      });

      it("rejects inserting a row that names another user", async () => {
        await expect(asUser(ctx.port, userB, spec.ownInsert(userA, "foreign"))).rejects.toThrow(
          /row-level security/i,
        );
      });

      it("hides the other user's rows from reads", async () => {
        await asUser(ctx.port, userA, spec.ownInsert(userA, "hidden"));
        const readB = await asUser(ctx.port, userB, `select * from public.${spec.table}`);
        expect(readB.rows.every((row) => row.user_id === userB)).toBe(true);
      });

      it("blocks updating the other user's rows", async () => {
        const { rows } = await ctx.admin.query(
          `select id from public.${spec.table} where user_id = $1`,
          [userA],
        );
        expect(rows.length).toBeGreaterThan(0);
        const result = await asUser(
          ctx.port,
          userB,
          `update public.${spec.table}
           set ${spec.updateColumn} = 'Hacked'
           where id = '${rows[0].id}'`,
        );
        expect(result.rowCount).toBe(0);
      });

      it("blocks deleting the other user's rows", async () => {
        const { rows } = await ctx.admin.query(
          `select id from public.${spec.table} where user_id = $1`,
          [userA],
        );
        const result = await asUser(
          ctx.port,
          userB,
          `delete from public.${spec.table} where id = '${rows[0].id}'`,
        );
        expect(result.rowCount).toBe(0);
      });
    });
  }
});
