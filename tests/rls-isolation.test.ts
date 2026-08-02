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

describe("Phase 1 RLS: two-user isolation", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    const files = await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    userA = await createUser(ctx.admin, "alice@example.test");
    userB = await createUser(ctx.admin, "bob@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  it("creates a profile row for each new user via the trigger", async () => {
    const { rows } = await ctx.admin.query(
      "select user_id, preferred_name from public.user_profiles order by created_at",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user_id).sort()).toEqual([userA, userB].sort());
    expect(rows.every((row) => row.preferred_name === null)).toBe(true);
  });

  it("allows each user to read and update only their own profile", async () => {
    const readA = await asUser(ctx.port, userA, "select * from public.user_profiles");
    expect(readA.rows).toHaveLength(1);
    expect(readA.rows[0].user_id).toBe(userA);

    const readB = await asUser(ctx.port, userB, "select * from public.user_profiles");
    expect(readB.rows).toHaveLength(1);
    expect(readB.rows[0].user_id).toBe(userB);

    await asUser(
      ctx.port,
      userA,
      `update public.user_profiles set preferred_name = 'Alice' where user_id = '${userA}'`,
    );
    const updated = await asUser(
      ctx.port,
      userA,
      "select preferred_name from public.user_profiles",
    );
    expect(updated.rows[0].preferred_name).toBe("Alice");
  });

  it("blocks user B from reading user A's profile", async () => {
    const readB = await asUser(ctx.port, userB, "select * from public.user_profiles");
    expect(readB.rows.map((row) => row.user_id)).not.toContain(userA);
  });

  it("blocks user B from updating user A's profile", async () => {
    const result = await asUser(
      ctx.port,
      userB,
      `update public.user_profiles set preferred_name = 'Hacked' where user_id = '${userA}'`,
    );
    expect(result.rowCount).toBe(0);

    const check = await ctx.admin.query(
      "select preferred_name from public.user_profiles where user_id = $1",
      [userA],
    );
    expect(check.rows[0].preferred_name).toBe("Alice");
  });

  it("blocks user B from deleting user A's profile", async () => {
    const result = await asUser(
      ctx.port,
      userB,
      `delete from public.user_profiles where user_id = '${userA}'`,
    );
    expect(result.rowCount).toBe(0);

    const check = await ctx.admin.query(
      "select count(*)::int as count from public.user_profiles where user_id = $1",
      [userA],
    );
    expect(check.rows[0].count).toBe(1);
  });

  it("shows user B zero rows for user A's data under direct database access", async () => {
    const readB = await asUser(ctx.port, userB, "select * from public.user_profiles");
    expect(readB.rows.every((row) => row.user_id === userB)).toBe(true);
  });

  it("maintains updated_at through the database trigger", async () => {
    await asUser(
      ctx.port,
      userA,
      "update public.user_profiles set location = 'Toronto, ON' where user_id = '" + userA + "'",
    );
    const { rows } = await ctx.admin.query(
      "select location, updated_at > created_at as touched from public.user_profiles where user_id = $1",
      [userA],
    );
    expect(rows[0].location).toBe("Toronto, ON");
    expect(rows[0].touched).toBe(true);
  });
});
