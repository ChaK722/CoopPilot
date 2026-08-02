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

const CREATE_SQL = (userId: string, key: string, skills = "'[]'::jsonb" as string) =>
  `select public.create_application(
     '${userId}', '${key}', 'Acme', 'Intern', 'Toronto, ON', 'Canada', 'Hybrid',
     'Co-op', '4 months', '2026-09-15', 'CAD 30/hr', '{"CS degree"}', '0-2 years',
     'https://example.com/job', 'The full original description.',
     '{"Build features"}', '{"TypeScript"}', ${skills}, 'saved'
   )`;

describe("Phase 3 persistence and idempotency", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  const creationKey = "c1111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "persist-a@example.test");
    userB = await createUser(ctx.admin, "persist-b@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("creates an application with skills and initial status event", async () => {
    const skills = `'[{"requirement_type":"required","name":"TypeScript","normalized_name":"typescript","sort_order":0}]'`;
    const created = await asUser(ctx.port, userA, CREATE_SQL(userA, creationKey, skills));
    const appId = created.rows[0].create_application as string;
    expect(appId).toBeTruthy();

    const reloaded = await asUser(
      ctx.port,
      userA,
      `select a.company, a.job_title, a.original_description, a.status,
              (select count(*) from public.application_skills s where s.application_id = a.id) as skills,
              (select count(*) from public.application_status_events e where e.application_id = a.id) as events
       from public.applications a where a.id = '${appId}'`,
    );
    expect(reloaded.rows[0]).toMatchObject({
      company: "Acme",
      job_title: "Intern",
      original_description: "The full original description.",
      status: "saved",
      skills: "1",
      events: "1",
    });
  });

  it("is idempotent for the same creation key", async () => {
    const first = await asUser(ctx.port, userA, CREATE_SQL(userA, creationKey));
    const second = await asUser(ctx.port, userA, CREATE_SQL(userA, creationKey));
    expect(first.rows[0].create_application).toBe(second.rows[0].create_application);

    const count = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.applications where user_id = '${userA}' and creation_key = '${creationKey}'`,
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("duplicates with a fresh id, fresh key, and fresh status history", async () => {
    const { rows } = await asUser(
      ctx.port,
      userA,
      `select id from public.applications where user_id = '${userA}' and creation_key = '${creationKey}'`,
    );
    const originalId = rows[0].id;

    const duplicated = await asUser(
      ctx.port,
      userA,
      `select public.duplicate_application('${userA}', '${originalId}')`,
    );
    const newId = duplicated.rows[0].duplicate_application as string;
    expect(newId).not.toBe(originalId);

    const check = await asUser(
      ctx.port,
      userA,
      `select a.id, a.status,
              (select count(*) from public.application_status_events e where e.application_id = a.id) as events,
              (select count(*) from public.application_skills s where s.application_id = a.id) as skills
       from public.applications a where a.id = '${newId}'`,
    );
    expect(check.rows[0].status).toBe("saved");
    expect(check.rows[0].events).toBe("1");
    expect(check.rows[0].skills).toBe("1");

    const originKey = await asUser(
      ctx.port,
      userA,
      `select creation_key from public.applications where id = '${originalId}'`,
    );
    const newKey = await asUser(
      ctx.port,
      userA,
      `select creation_key from public.applications where id = '${newId}'`,
    );
    expect(newKey.rows[0].creation_key).not.toBe(originKey.rows[0].creation_key);
  });

  it("persists across a fresh connection (refresh simulation)", async () => {
    const { rows } = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.applications where user_id = '${userA}'`,
    );
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(2);
  });

  it("rejects RPC calls with a foreign user id", async () => {
    await expect(
      asUser(ctx.port, userB, CREATE_SQL(userA, "c2222222-2222-4222-8222-222222222222")),
    ).rejects.toThrow(/not allowed/i);
  });

  it("returns null when duplicating another user's application", async () => {
    const { rows } = await asUser(
      ctx.port,
      userA,
      `select id from public.applications where user_id = '${userA}' and creation_key = '${creationKey}'`,
    );
    const result = await asUser(
      ctx.port,
      userB,
      `select public.duplicate_application('${userB}', '${rows[0].id}')`,
    );
    expect(result.rows[0].duplicate_application).toBeNull();
  });
});
