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

describe("Phase 2 RLS: education, skills, experience, projects", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    const files = await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    userA = await createUser(ctx.admin, "carol@example.test");
    userB = await createUser(ctx.admin, "dave@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("enables RLS on every Phase 2 table", async () => {
    const { rows } = await ctx.admin.query(
      `select relname from pg_class
       where relname in ('educations', 'profile_skills', 'experiences', 'projects')
         and relrowsecurity = true
       order by relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([
      "educations",
      "experiences",
      "profile_skills",
      "projects",
    ]);
  });

  it("lets each user insert their own records", async () => {
    const result = await asUser(
      ctx.port,
      userA,
      `insert into public.educations (user_id, school, degree, program, sort_order)
       values ('${userA}', 'Waterloo', 'BSc', 'CS', 0) returning id`,
    );
    expect(result.rowCount).toBe(1);
  });

  it("blocks inserting a row that names another user", async () => {
    await expect(
      asUser(
        ctx.port,
        userB,
        `insert into public.educations (user_id, school, degree, program)
         values ('${userA}', 'Hacked', 'BSc', 'CS')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("isolates education reads, updates, and deletes between users", async () => {
    const readB = await asUser(ctx.port, userB, "select * from public.educations");
    expect(readB.rows.every((row) => row.user_id === userB)).toBe(true);

    const { rows: aRows } = await ctx.admin.query(
      "select id from public.educations where user_id = $1",
      [userA],
    );
    expect(aRows.length).toBeGreaterThan(0);
    const aId = aRows[0].id;

    const update = await asUser(
      ctx.port,
      userB,
      `update public.educations set school = 'Hacked' where id = '${aId}'`,
    );
    expect(update.rowCount).toBe(0);

    const del = await asUser(ctx.port, userB, `delete from public.educations where id = '${aId}'`);
    expect(del.rowCount).toBe(0);

    const check = await ctx.admin.query("select school from public.educations where id = $1", [
      aId,
    ]);
    expect(check.rows[0].school).toBe("Waterloo");
  });

  it("isolates skills, experiences, and projects between users", async () => {
    await asUser(
      ctx.port,
      userA,
      `insert into public.profile_skills (user_id, category, name, normalized_name)
       values ('${userA}', 'tools', 'Git', 'git')`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.experiences (user_id, title, organization, sort_order)
       values ('${userA}', 'Intern', 'Acme', 0)`,
    );
    await asUser(
      ctx.port,
      userA,
      `insert into public.projects (user_id, name, sort_order)
       values ('${userA}', 'Project X', 0)`,
    );

    const skillsB = await asUser(ctx.port, userB, "select * from public.profile_skills");
    const experiencesB = await asUser(ctx.port, userB, "select * from public.experiences");
    const projectsB = await asUser(ctx.port, userB, "select * from public.projects");

    expect(skillsB.rows.every((row) => row.user_id === userB)).toBe(true);
    expect(experiencesB.rows.every((row) => row.user_id === userB)).toBe(true);
    expect(projectsB.rows.every((row) => row.user_id === userB)).toBe(true);

    const { rows: expRows } = await ctx.admin.query(
      "select id from public.experiences where user_id = $1",
      [userA],
    );
    const del = await asUser(
      ctx.port,
      userB,
      `delete from public.experiences where id = '${expRows[0].id}'`,
    );
    expect(del.rowCount).toBe(0);

    const { rows: projRows } = await ctx.admin.query(
      "select id from public.projects where user_id = $1",
      [userA],
    );
    const upd = await asUser(
      ctx.port,
      userB,
      `update public.projects set name = 'Hacked' where id = '${projRows[0].id}'`,
    );
    expect(upd.rowCount).toBe(0);
  });

  it("deduplicates skills by normalized name per category", async () => {
    await asUser(
      ctx.port,
      userA,
      `insert into public.profile_skills (user_id, category, name, normalized_name)
       values ('${userA}', 'tools', 'Node.js', 'node.js')`,
    );
    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.profile_skills (user_id, category, name, normalized_name)
         values ('${userA}', 'tools', 'NODE.JS', 'node.js')`,
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it("only lets a user replace their own skills through the RPC", async () => {
    const ok = await asUser(
      ctx.port,
      userA,
      `select public.replace_profile_skills(
         '${userA}',
         '[{"category":"tools","name":"Docker","normalized_name":"docker"}]'::jsonb
       )`,
    );
    expect(ok.rows).toBeDefined();

    await expect(
      asUser(
        ctx.port,
        userB,
        `select public.replace_profile_skills(
           '${userA}',
           '[{"category":"tools","name":"Hacked","normalized_name":"hacked"}]'::jsonb
         )`,
      ),
    ).rejects.toThrow(/not allowed/i);
  });
});
