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
  ownInsert: (userId: string, applicationId: string) => string;
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
  let appB: string;

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

    const createdB = await asUser(
      ctx.port,
      userB,
      `select public.create_application(
         '${userB}', gen_random_uuid(), 'B Corp', 'B Role', null, null, null, null, null,
         null, null, '{}', null, null, 'B job text', '{}', '{}', '[]'::jsonb, 'saved'
       )`,
    );
    appB = createdB.rows[0].create_application;
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
        const inserted = await asUser(
          ctx.port,
          userA,
          `${spec.ownInsert(userA, appA)} returning id`,
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
        await expect(asUser(ctx.port, userB, spec.ownInsert(userA, appA))).rejects.toThrow(
          /row-level security/i,
        );
      });

      it("hides the other user's rows from reads", async () => {
        await asUser(ctx.port, userA, spec.ownInsert(userA, appA));
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

  it("prevents re-linking an interview to another user's application", async () => {
    const { rows } = await ctx.admin.query(
      "select id from public.interviews where user_id = $1 limit 1",
      [userA],
    );
    let interviewId = rows[0]?.id as string | undefined;
    if (!interviewId) {
      await asUser(
        ctx.port,
        userA,
        `insert into public.interviews (user_id, application_id, interview_type, scheduled_at)
         values ('${userA}', '${appA}', 'Technical', now())`,
      );
      const { rows: after } = await ctx.admin.query(
        "select id from public.interviews where user_id = $1 limit 1",
        [userA],
      );
      interviewId = after[0].id;
    }

    await expect(
      asUser(
        ctx.port,
        userA,
        `update public.interviews
         set application_id = '${appB}'
         where id = '${interviewId}'`,
      ),
    ).rejects.toThrow(/row-level security/i);

    const unchanged = await ctx.admin.query(
      "select application_id from public.interviews where id = $1",
      [interviewId],
    );
    expect(unchanged.rows[0].application_id).toBe(appA);
  });

  describe("application_status_events append-only", () => {
    it("allows reading the initial event created by the RPC", async () => {
      const read = await asUser(
        ctx.port,
        userA,
        `select * from public.application_status_events where user_id = '${userA}'`,
      );
      expect(read.rows.length).toBeGreaterThan(0);
      expect(read.rows[0].from_status).toBeNull();
      expect(read.rows[0].to_status).toBe("saved");
    });

    it("rejects direct inserts by ordinary users", async () => {
      await expect(
        asUser(
          ctx.port,
          userA,
          `insert into public.application_status_events
             (user_id, application_id, from_status, to_status)
           values ('${userA}', '${appA}', 'saved', 'applied')`,
        ),
      ).rejects.toThrow(/row-level security|permission denied/i);
    });

    it("rejects direct updates by ordinary users", async () => {
      const { rows } = await ctx.admin.query(
        "select id from public.application_status_events where user_id = $1 limit 1",
        [userA],
      );
      const result = await asUser(
        ctx.port,
        userA,
        `update public.application_status_events
         set to_status = 'applied'
         where id = '${rows[0].id}'`,
      );
      expect(result.rowCount).toBe(0);
      const unchanged = await ctx.admin.query(
        "select to_status from public.application_status_events where id = $1",
        [rows[0].id],
      );
      expect(unchanged.rows[0].to_status).toBe("saved");
    });

    it("rejects direct deletes by ordinary users", async () => {
      const { rows } = await ctx.admin.query(
        "select id from public.application_status_events where user_id = $1 limit 1",
        [userA],
      );
      const result = await asUser(
        ctx.port,
        userA,
        `delete from public.application_status_events where id = '${rows[0].id}'`,
      );
      expect(result.rowCount).toBe(0);
      const stillThere = await ctx.admin.query(
        "select count(*)::int as c from public.application_status_events where id = $1",
        [rows[0].id],
      );
      expect(stillThere.rows[0].c).toBe(1);
    });
  });
});
