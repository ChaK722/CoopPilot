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

describe("Phase 4 archive/restore RLS and queries", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;
  let appId: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "archive-a@example.test");
    userB = await createUser(ctx.admin, "archive-b@example.test");

    const created = await asUser(
      ctx.port,
      userA,
      `select public.create_application(
         '${userA}', gen_random_uuid(), 'Acme', 'Intern', null, null, null, null, null,
         null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
       )`,
    );
    appId = created.rows[0].create_application;
    // Move to applied so restore-to-prior-status is observable.
    await asUser(
      ctx.port,
      userA,
      `select public.update_application_status('${userA}', '${appId}', 'applied', null)`,
    );
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("archives without changing status", async () => {
    const result = await asUser(
      ctx.port,
      userA,
      `update public.applications set archived_at = now() where id = '${appId}' and user_id = '${userA}'`,
    );
    expect(result.rowCount).toBe(1);

    const row = await asUser(
      ctx.port,
      userA,
      `select status, archived_at from public.applications where id = '${appId}'`,
    );
    expect(row.rows[0].status).toBe("applied");
    expect(row.rows[0].archived_at).not.toBeNull();
  });

  it("excludes archived applications from the board query", async () => {
    const board = await asUser(
      ctx.port,
      userA,
      `select id from public.applications where user_id = '${userA}' and archived_at is null`,
    );
    expect(board.rows.map((row) => row.id)).not.toContain(appId);
  });

  it("includes archived applications only in the archive query", async () => {
    const archived = await asUser(
      ctx.port,
      userA,
      `select id from public.applications where user_id = '${userA}' and archived_at is not null`,
    );
    expect(archived.rows.map((row) => row.id)).toContain(appId);
  });

  it("persists the archive state across a fresh connection", async () => {
    const row = await asUser(
      ctx.port,
      userA,
      `select archived_at from public.applications where id = '${appId}'`,
    );
    expect(row.rows[0].archived_at).not.toBeNull();
  });

  it("prevents user B from archiving or restoring user A's application", async () => {
    const archive = await asUser(
      ctx.port,
      userB,
      `update public.applications set archived_at = now() where id = '${appId}' and user_id = '${userA}'`,
    );
    expect(archive.rowCount).toBe(0);

    const restore = await asUser(
      ctx.port,
      userB,
      `update public.applications set archived_at = null where id = '${appId}' and user_id = '${userA}'`,
    );
    expect(restore.rowCount).toBe(0);

    const row = await asUser(
      ctx.port,
      userA,
      `select archived_at from public.applications where id = '${appId}'`,
    );
    expect(row.rows[0].archived_at).not.toBeNull();
  });

  it("restores to the prior status with archived_at cleared", async () => {
    const result = await asUser(
      ctx.port,
      userA,
      `update public.applications set archived_at = null where id = '${appId}' and user_id = '${userA}'`,
    );
    expect(result.rowCount).toBe(1);

    const row = await asUser(
      ctx.port,
      userA,
      `select status, archived_at from public.applications where id = '${appId}'`,
    );
    expect(row.rows[0].status).toBe("applied");
    expect(row.rows[0].archived_at).toBeNull();
  });
});
