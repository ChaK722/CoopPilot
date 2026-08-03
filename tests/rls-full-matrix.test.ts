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

// Phase 7: complete RLS/ownership matrix across every user-owned table.
// Verified on real embedded PostgreSQL with two users and cross-user UUIDs.

const FULL_CRUD_TABLES = [
  "user_profiles",
  "educations",
  "profile_skills",
  "experiences",
  "projects",
  "applications",
  "interviews",
] as const;

// Select-only for ordinary users; every write flows through a controlled RPC.
const APPEND_ONLY_TABLES = [
  "ai_runs",
  "match_analyses",
  "generated_documents",
  "application_status_events",
] as const;

describe("Phase 7 RLS full matrix", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appA: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "matrix-a@example.test");
    userB = await createUser(ctx.admin, "matrix-b@example.test");

    const created = await asUser(
      ctx.port,
      userA,
      `select public.create_application(
         '${userA}', gen_random_uuid(), 'Matrix Co', 'Role', null, null, null, null, null,
         null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
       )`,
    );
    appA = created.rows[0].create_application;

    // Seed persistent A-owned rows used by the cross-user attempts.
    await asUser(
      ctx.port,
      userA,
      `update public.user_profiles set preferred_name = 'Matrix A' where user_id = '${userA}'`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.educations (user_id, school, degree, program)
       values ('${userA}', 'U', 'BSc', 'CS')`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.profile_skills (user_id, category, name, normalized_name)
       values ('${userA}', 'tools', 'Git', 'git')`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.experiences (user_id, title, organization)
       values ('${userA}', 'Intern', 'Acme')`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.projects (user_id, name) values ('${userA}', 'Project')`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.interviews (user_id, application_id, interview_type, scheduled_at)
       values ('${userA}', '${appA}', 'Technical', now())`,
    );
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it.each(FULL_CRUD_TABLES)(
    "lets user A select, insert, update, and delete their own %s",
    async (table) => {
      const insertSql: Record<string, string> = {
        user_profiles: `insert into public.user_profiles (user_id, preferred_name)
          values ('${userA}', 'Temporary A') returning id`,
        educations: `insert into public.educations (user_id, school, degree, program)
          values ('${userA}', 'Temp U', 'BSc', 'CS') returning id`,
        profile_skills: `insert into public.profile_skills (user_id, category, name, normalized_name)
          values ('${userA}', 'tools', 'Tmp', 'tmp') returning id`,
        experiences: `insert into public.experiences (user_id, title, organization)
          values ('${userA}', 'Temp', 'Acme') returning id`,
        projects: `insert into public.projects (user_id, name)
          values ('${userA}', 'Temp Project') returning id`,
        applications: `select public.create_application(
          '${userA}', gen_random_uuid(), 'Insert Co', 'Role', null, null, null, null, null,
          null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
        ) as id`,
        interviews: `insert into public.interviews (user_id, application_id, interview_type, scheduled_at)
          values ('${userA}', '${appA}', 'Technical', now()) returning id`,
      };
      if (table === "user_profiles") {
        // The auth trigger auto-creates the profile row; remove it first so
        // inserting the user's own row is exercised.
        await asUser(
          ctx.port,
          userA,
          `delete from public.user_profiles where user_id = '${userA}'`,
        );
      }
      const inserted = await asUser(ctx.port, userA, insertSql[table]);
      const rowId = inserted.rows[0].id ?? inserted.rows[0].create_application;
      expect(rowId).toBeTruthy();

      const updateSql: Record<string, string> = {
        user_profiles: `update public.user_profiles set preferred_name = 'Updated' where id = '${rowId}'`,
        educations: `update public.educations set school = 'Updated U' where id = '${rowId}'`,
        profile_skills: `update public.profile_skills set name = 'GitHub' where id = '${rowId}'`,
        experiences: `update public.experiences set title = 'Senior' where id = '${rowId}'`,
        projects: `update public.projects set name = 'Updated' where id = '${rowId}'`,
        applications: `update public.applications set company = 'Updated' where id = '${rowId}'`,
        interviews: `update public.interviews set notes = 'n' where id = '${rowId}'`,
      };
      const updated = await asUser(ctx.port, userA, updateSql[table]);
      expect(updated.rowCount).toBe(1);

      const deleted = await asUser(
        ctx.port,
        userA,
        `delete from public.${table} where id = '${rowId}'`,
      );
      expect(deleted.rowCount).toBe(1);

      if (table === "user_profiles") {
        // Restore the profile so later ownership assertions still have a row.
        await asUser(
          ctx.port,
          userA,
          `insert into public.user_profiles (user_id, preferred_name)
           values ('${userA}', 'Matrix A')`,
        );
      }
    },
  );

  it.each(FULL_CRUD_TABLES)(
    "prevents user B from reading, updating, or deleting user A's %s",
    async (table) => {
      const lookupSql: Record<string, string> = {
        user_profiles: `select id from public.user_profiles where user_id = '${userA}' limit 1`,
        educations: `select id from public.educations where user_id = '${userA}' limit 1`,
        profile_skills: `select id from public.profile_skills where user_id = '${userA}' limit 1`,
        experiences: `select id from public.experiences where user_id = '${userA}' limit 1`,
        projects: `select id from public.projects where user_id = '${userA}' limit 1`,
        applications: `select id from public.applications where user_id = '${userA}' limit 1`,
        interviews: `select id from public.interviews where user_id = '${userA}' limit 1`,
      };
      const row = await asUser(ctx.port, userA, lookupSql[table]);
      const rowId = row.rows[0]?.id;
      expect(rowId).toBeTruthy();

      const read = await asUser(
        ctx.port,
        userB,
        `select * from public.${table} where id = '${rowId}'`,
      );
      expect(read.rows).toHaveLength(0);

      const updated = await asUser(
        ctx.port,
        userB,
        `update public.${table} set user_id = user_id where id = '${rowId}'`,
      );
      expect(updated.rowCount).toBe(0);

      const deleted = await asUser(
        ctx.port,
        userB,
        `delete from public.${table} where id = '${rowId}'`,
      );
      expect(deleted.rowCount).toBe(0);
    },
  );

  it("rejects spoofed cross-user inserts on every full-CRUD table", async () => {
    const insertSqls = [
      `insert into public.user_profiles (user_id, preferred_name)
         values ('${userA}', 'Spoofed')`,
      `insert into public.educations (user_id, school, degree, program)
         values ('${userA}', 'U', 'BSc', 'CS')`,
      `insert into public.profile_skills (user_id, category, name, normalized_name)
         values ('${userA}', 'tools', 'Git', 'git')`,
      `insert into public.experiences (user_id, title, organization)
         values ('${userA}', 'Intern', 'Acme')`,
      `insert into public.projects (user_id, name) values ('${userA}', 'Project')`,
      `insert into public.applications (
         user_id, creation_key, company, job_title, original_description, status
       ) values ('${userA}', gen_random_uuid(), 'Spoof', 'Role', 'x', 'saved')`,
      `insert into public.interviews (
         user_id, application_id, interview_type, scheduled_at
       ) values ('${userA}', '${appA}', 'Technical', now())`,
      `insert into public.application_skills (
         user_id, application_id, requirement_type, name, normalized_name, sort_order
       ) values ('${userA}', '${appA}', 'required', 'TypeScript', 'typescript', 0)`,
    ];
    for (const sql of insertSqls) {
      await expect(asUser(ctx.port, userB, sql)).rejects.toThrow(
        /row-level security|permission denied|violates/i,
      );
    }
  });

  it("lets user A manage their own application_skills on owned applications", async () => {
    await asUser(
      ctx.port,
      userA,
      `insert into public.application_skills (
         user_id, application_id, requirement_type, name, normalized_name, sort_order
       ) values ('${userA}', '${appA}', 'required', 'TypeScript', 'typescript', 0)`,
    );
    const read = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.application_skills where application_id = '${appA}'`,
    );
    expect(Number(read.rows[0].count)).toBe(1);
  });

  it.each(APPEND_ONLY_TABLES)(
    "allows own selects but rejects direct writes on %s",
    async (table) => {
      const seedSql: Record<string, string> = {
        ai_runs: `insert into public.ai_runs (
           user_id, application_id, operation, idempotency_key, generation_mode, status
         ) values ('${userA}', '${appA}', 'match_analysis', gen_random_uuid(), 'demo', 'running')`,
        match_analyses: `insert into public.match_analyses (
           user_id, application_id, overall_score, score_breakdown,
           profile_source_hash, application_source_hash, generation_mode
         ) values ('${userA}', '${appA}', 50, '{}', 'hp', 'ha', 'demo')`,
        generated_documents: `insert into public.generated_documents (
           user_id, application_id, document_type, version, content_text, generation_mode
         ) values ('${userA}', '${appA}', 'cover_letter', 1, 'Draft', 'demo')`,
        application_status_events: `insert into public.application_status_events (
           user_id, application_id, from_status, to_status
         ) values ('${userA}', '${appA}', null, 'saved')`,
      };
      await ctx.admin.query(seedSql[table]);

      const read = await asUser(
        ctx.port,
        userA,
        `select count(*) from public.${table} where user_id = '${userA}'`,
      );
      expect(Number(read.rows[0].count)).toBeGreaterThan(0);

      const writeSqls: Record<string, string[]> = {
        ai_runs: [
          `insert into public.ai_runs (
             user_id, application_id, operation, idempotency_key, generation_mode, status
           ) values ('${userA}', '${appA}', 'match_analysis', gen_random_uuid(), 'demo', 'running')`,
          `update public.ai_runs set status = 'succeeded' where user_id = '${userA}'`,
          `delete from public.ai_runs where user_id = '${userA}'`,
        ],
        match_analyses: [
          `insert into public.match_analyses (
             user_id, application_id, overall_score, score_breakdown,
             profile_source_hash, application_source_hash, generation_mode
           ) values ('${userA}', '${appA}', 50, '{}', 'hp', 'ha', 'demo')`,
          `update public.match_analyses set overall_score = 99 where user_id = '${userA}'`,
          `delete from public.match_analyses where user_id = '${userA}'`,
        ],
        generated_documents: [
          `insert into public.generated_documents (
             user_id, application_id, document_type, version, content_text, generation_mode
           ) values ('${userA}', '${appA}', 'cover_letter', 2, 'x', 'demo')`,
          `update public.generated_documents set content_text = 'x' where user_id = '${userA}'`,
          `delete from public.generated_documents where user_id = '${userA}'`,
        ],
        application_status_events: [
          `insert into public.application_status_events (
             user_id, application_id, from_status, to_status
           ) values ('${userA}', '${appA}', 'saved', 'applied')`,
          `update public.application_status_events set to_status = 'offer'
             where user_id = '${userA}'`,
          `delete from public.application_status_events where user_id = '${userA}'`,
        ],
      };
      if (table === "application_status_events") {
        // INSERT has no policy so it errors; UPDATE/DELETE have no policy so
        // RLS silently filters every row (0 affected) - both are denied.
        await expect(asUser(ctx.port, userA, writeSqls[table][0])).rejects.toThrow(
          /row-level security|permission denied/i,
        );
        for (const sql of writeSqls[table].slice(1)) {
          const result = await asUser(ctx.port, userA, sql);
          expect(result.rowCount).toBe(0);
        }
      } else {
        for (const sql of writeSqls[table]) {
          await expect(asUser(ctx.port, userA, sql)).rejects.toThrow(
            /row-level security|permission denied/i,
          );
        }
      }
    },
  );

  it("keeps user A's data intact after all cross-user attempts", async () => {
    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.applications where user_id = '${userA}'`,
    );
    expect(Number(count.rows[0].count)).toBe(1);
    const company = await asUser(
      ctx.port,
      userA,
      `select company from public.applications where id = '${appA}'`,
    );
    expect(company.rows[0].company).toBe("Matrix Co");
    const profile = await asUser(
      ctx.port,
      userA,
      `select preferred_name from public.user_profiles where user_id = '${userA}'`,
    );
    expect(profile.rows[0].preferred_name).toBe("Matrix A");
  });
});
