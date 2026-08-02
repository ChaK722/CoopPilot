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

const ALL_STATUSES = [
  "saved",
  "preparing",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

function dateValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function createAppSql(userId: string, company = "Acme"): string {
  return `select public.create_application(
    '${userId}', gen_random_uuid(), '${company}', 'Intern', null, null, null, null, null,
    null, null, '{}', null, null, 'Job text', '{}', '{}', '[]'::jsonb, 'saved'
  )`;
}

function updateSql(
  userId: string,
  appId: string,
  toStatus: string,
  dateApplied: string | null = "null",
): string {
  return `select public.update_application_status('${userId}', '${appId}', '${toStatus}', ${dateApplied})`;
}

describe("update_application_status RPC", () => {
  let ctx: TestPostgres;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    ctx = await startTestPostgres();
    await bootstrapAuthShim(ctx.admin);
    await applyMigrations(ctx.admin, join(process.cwd(), "supabase", "migrations"));
    userA = await createUser(ctx.admin, "status-a@example.test");
    userB = await createUser(ctx.admin, "status-b@example.test");
  }, 180_000);

  afterAll(async () => {
    await ctx.stop();
  }, 120_000);

  async function createApp(userId: string, company = "Acme"): Promise<string> {
    const result = await asUser(ctx.port, userId, createAppSql(userId, company));
    return result.rows[0].create_application as string;
  }

  it("updates to every one of the seven statuses with exactly one event each", async () => {
    const appId = await createApp(userA, "Seven States");

    for (let i = 1; i < ALL_STATUSES.length; i++) {
      const toStatus = ALL_STATUSES[i];
      const result = await asUser(ctx.port, userA, updateSql(userA, appId, toStatus));
      expect(result.rows[0].update_application_status).toBe(appId);

      const row = await asUser(
        ctx.port,
        userA,
        `select status from public.applications where id = '${appId}'`,
      );
      expect(row.rows[0].status).toBe(toStatus);

      const events = await asUser(
        ctx.port,
        userA,
        `select from_status, to_status from public.application_status_events
         where application_id = '${appId}' order by changed_at, id`,
      );
      expect(events.rows).toHaveLength(i + 1);
      expect(events.rows[i].from_status).toBe(ALL_STATUSES[i - 1]);
      expect(events.rows[i].to_status).toBe(toStatus);
    }
  });

  it("records from_status from the database, not the client", async () => {
    const appId = await createApp(userA, "From Status");
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "interview"));

    const events = await asUser(
      ctx.port,
      userA,
      `select from_status, to_status from public.application_status_events
       where application_id = '${appId}' order by changed_at, id`,
    );
    expect(events.rows.map((row) => `${row.from_status}->${row.to_status}`)).toEqual([
      "null->saved",
      "saved->applied",
      "applied->interview",
    ]);
  });

  it("does not append an event when the status is unchanged", async () => {
    const appId = await createApp(userA, "No Op");
    await asUser(ctx.port, userA, updateSql(userA, appId, "saved"));

    const events = await asUser(
      ctx.port,
      userA,
      `select count(*) from public.application_status_events where application_id = '${appId}'`,
    );
    expect(events.rows[0].count).toBe("1");
  });

  it("rejects invalid statuses before touching any data", async () => {
    const appId = await createApp(userA, "Invalid");
    await expect(asUser(ctx.port, userA, updateSql(userA, appId, "not_a_status"))).rejects.toThrow(
      /invalid status/i,
    );

    const check = await asUser(
      ctx.port,
      userA,
      `select status from public.applications where id = '${appId}'`,
    );
    expect(check.rows[0].status).toBe("saved");
  });

  it("returns null (Not Found) for missing records", async () => {
    const result = await asUser(
      ctx.port,
      userA,
      updateSql(userA, "00000000-0000-4000-8000-000000000000", "applied"),
    );
    expect(result.rows[0].update_application_status).toBeNull();
  });

  it("prevents user B from changing user A's status", async () => {
    const appId = await createApp(userA, "Isolation");
    const result = await asUser(ctx.port, userB, updateSql(userB, appId, "applied"));
    expect(result.rows[0].update_application_status).toBeNull();

    const check = await asUser(
      ctx.port,
      userA,
      `select status from public.applications where id = '${appId}'`,
    );
    expect(check.rows[0].status).toBe("saved");
  });

  it("rejects calls that claim a different user id", async () => {
    const appId = await createApp(userA, "Spoof");
    await expect(asUser(ctx.port, userB, updateSql(userA, appId, "applied"))).rejects.toThrow(
      /not allowed/i,
    );
  });

  it("sets date_applied when provided, keeps it null on skip, and preserves it later", async () => {
    const appId = await createApp(userA, "Dates");

    // Skip: date stays null.
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied", "null"));
    let row = await asUser(
      ctx.port,
      userA,
      `select date_applied from public.applications where id = '${appId}'`,
    );
    expect(row.rows[0].date_applied).toBeNull();

    // Leave applied, then come back with a date.
    await asUser(ctx.port, userA, updateSql(userA, appId, "interview"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied", "'2026-08-01'"));
    row = await asUser(
      ctx.port,
      userA,
      `select date_applied from public.applications where id = '${appId}'`,
    );
    expect(dateValue(row.rows[0].date_applied)).toBe("2026-08-01");

    // Leaving applied does not clear the date; returning keeps the existing value.
    await asUser(ctx.port, userA, updateSql(userA, appId, "rejected"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied", "'2026-08-05'"));
    row = await asUser(
      ctx.port,
      userA,
      `select date_applied from public.applications where id = '${appId}'`,
    );
    expect(dateValue(row.rows[0].date_applied)).toBe("2026-08-01");
  });

  it("keeps ordinary users unable to write status events directly", async () => {
    const appId = await createApp(userA, "Append Only");
    await expect(
      asUser(
        ctx.port,
        userA,
        `insert into public.application_status_events
           (user_id, application_id, from_status, to_status)
         values ('${userA}', '${appId}', 'saved', 'applied')`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it("handles rapid sequential updates without duplicate history", async () => {
    const appId = await createApp(userA, "Rapid");
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "applied"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "interview"));
    await asUser(ctx.port, userA, updateSql(userA, appId, "interview"));

    const events = await asUser(
      ctx.port,
      userA,
      `select from_status, to_status from public.application_status_events
       where application_id = '${appId}' order by changed_at, id`,
    );
    expect(events.rows.map((row) => `${row.from_status}->${row.to_status}`)).toEqual([
      "null->saved",
      "saved->applied",
      "applied->interview",
    ]);
  });
});
