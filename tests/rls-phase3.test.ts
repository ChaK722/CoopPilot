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
  ownInsert: (userId: string, applicationId: string, label: string) => string;
  updateColumn: string;
  updateValue?: string;
  extraInsert?: (userId: string, foreignApplicationId: string) => string;
}

const TABLES: TableSpec[] = [
  {
    table: "applications",
    ownInsert: (userId) =>
      `insert into public.applications
         (user_id, creation_key, company, job_title, original_description)
       values ('${userId}', gen_random_uuid(), 'Company', 'Role', 'desc')`,
    updateColumn: "company",
  },
  {
    table: "application_skills",
    ownInsert: (userId, applicationId) =>
      `insert into public.application_skills
         (user_id, application_id, requirement_type, name, normalized_name)
       values ('${userId}', '${applicationId}', 'required', 'Skill', 'skill')`,
    updateColumn: "name",
    extraInsert: (userId, foreignApplicationId) =>
      `insert into public.application_skills
         (user_id, application_id, requirement_type, name, normalized_name)
       values ('${userId}', '${foreignApplicationId}', 'required', 'Sneaky', 'sneaky')`,
  },
  {
    table: "application_status_events",
    ownInsert: (userId, applicationId) =>
      `insert into public.application_status_events
         (user_id, application_id, from_status, to_status)
       values ('${userId}', '${applicationId}', null, 'saved')`,
    updateColumn: "to_status",
    updateValue: "applied",
    extraInsert: (userId, foreignApplicationId) =>
      `insert into public.application_status_events
         (user_id, application_id, from_status, to_status)
       values ('${userId}', '${foreignApplicationId}', null, 'saved')`,
  },
  {
    table: "interviews",
    ownInsert: (userId, applicationId) =>
      `insert into public.interviews
         (user_id, application_id, interview_type, scheduled_at)
       values ('${userId}', '${applicationId}', 'Type', now())`,
    updateColumn: "interview_type",
    extraInsert: (userId, foreignApplicationId) =>
      `insert into public.interviews
         (user_id, application_id, interview_type, scheduled_at)
       values ('${userId}', '${foreignApplicationId}', 'Sneaky', now())`,
  },
];

describe("Phase 3 RLS matrix: all four application tables", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "phase3-a@example.test");
    userB = await createUser(ctx.admin, "phase3-b@example.test");

    const created = await asUser(
      ctx.port,
      userA,
      `select public.create_application(
         '${userA}', gen_random_uuid(), 'Acme', 'Intern', null, null, null, null, null,
         null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
       )`,
    );
    appA = created.rows[0].create_application;
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("enables RLS on all four Phase 3 tables", async () => {
    const { rows } = await ctx.admin.query(
      `select relname from pg_class
       where relname in ('applications', 'application_skills', 'application_status_events', 'interviews')
         and relrowsecurity = true
       order by relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([
      "application_skills",
      "application_status_events",
      "applications",
      "interviews",
    ]);
  });

  for (const spec of TABLES) {
    describe(spec.table, () => {
      it("allows the owner to insert, read, update, and delete their own rows", async () => {
        const label = `own-${spec.table}`;
        const inserted = await asUser(
          ctx.port,
          userA,
          `${spec.ownInsert(userA, appA, label)} returning id`,
        );
        const rowId = inserted.rows[0].id;

        const read = await asUser(
          ctx.port,
          userA,
          `select * from public.${spec.table} where id = '${rowId}' and user_id = '${userA}'`,
        );
        expect(read.rows.length).toBeGreaterThan(0);

        const update = await asUser(
          ctx.port,
          userA,
          `update public.${spec.table} set ${spec.updateColumn} = '${spec.updateValue ?? "Updated"}' where id = '${rowId}'`,
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
        await expect(
          asUser(ctx.port, userB, spec.ownInsert(userA, appA, "foreign")),
        ).rejects.toThrow(/row-level security/i);
      });

      it("hides the other user's rows from reads", async () => {
        await asUser(ctx.port, userA, spec.ownInsert(userA, appA, "hidden"));
        const readB = await asUser(ctx.port, userB, `select * from public.${spec.table}`);
        expect(readB.rows.every((row) => row.user_id === userB)).toBe(true);
      });

      it("blocks updating the other user's rows", async () => {
        const { rows } = await ctx.admin.query(
          `select id from public.${spec.table} where user_id = $1 limit 1`,
          [userA],
        );
        expect(rows.length).toBeGreaterThan(0);
        const result = await asUser(
          ctx.port,
          userB,
          `update public.${spec.table}
           set ${spec.updateColumn} = '${spec.updateValue ?? "Hacked"}'
           where id = '${rows[0].id}'`,
        );
        expect(result.rowCount).toBe(0);
      });

      it("blocks deleting the other user's rows", async () => {
        const { rows } = await ctx.admin.query(
          `select id from public.${spec.table} where user_id = $1 limit 1`,
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

  it("rejects child rows that reference another user's application", async () => {
    for (const spec of TABLES) {
      if (!spec.extraInsert) continue;
      await expect(asUser(ctx.port, userB, spec.extraInsert(userB, appA))).rejects.toThrow(
        /row-level security/i,
      );
    }
  });
});
