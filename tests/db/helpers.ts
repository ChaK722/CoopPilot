import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { Client } = pg;

export interface TestPostgres {
  db: EmbeddedPostgres;
  admin: pg.Client;
  port: number;
  stop: () => Promise<void>;
}

export async function startTestPostgres(): Promise<TestPostgres> {
  const dataDir = mkdtempSync(join(tmpdir(), "cooppilot-pg-"));
  const port = 55432 + Math.floor(Math.random() * 500);
  const db = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await db.initialise();
  await db.start();

  const admin = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await admin.connect();

  return {
    db,
    admin,
    port,
    stop: async () => {
      await admin.end().catch(() => undefined);
      if (process.platform === "win32") {
        // embedded-postgres's stop() can hang on Windows (taskkill exit
        // race). Shut the cluster down through pg_ctl directly instead.
        const dataDir = db["options"].databaseDir as string;
        const { spawnSync } = await import("node:child_process");
        const pgBin = join(
          process.cwd(),
          "node_modules",
          "@embedded-postgres",
          "windows-x64",
          "native",
          "bin",
        );
        const pgCtl = join(pgBin, "pg_ctl.exe");
        spawnSync(pgCtl, ["-D", dataDir, "stop", "-m", "fast"], {
          stdio: "ignore",
          timeout: 30_000,
        });
        await db.stop().catch(() => undefined);
      } else {
        await db.stop();
      }
    },
  };
}

/**
 * Supabase-like bootstrap that the migrations assume: auth schema, users
 * table, and the unauthenticated role.
 */
export async function bootstrapAuthShim(admin: pg.Client) {
  await admin.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text not null,
      created_at timestamptz not null default now()
    );
  `);
  // Supabase ships an `anon` role; the embedded test database does not.
  // Creating it makes function-ACL revocations in migrations exercise the
  // same code path as hosted Supabase.
  await admin.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
    end
    $$;
  `);
}

/** Apply supabase/migrations/*.sql in filename order. */
export async function applyMigrations(admin: pg.Client, migrationsDir: string) {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await admin.query(sql);
  }
  return files;
}

export async function createUser(admin: pg.Client, email: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email],
  );
  return rows[0].id;
}

/**
 * Run SQL as the `authenticated` role with a given JWT subject, exactly like
 * Supabase's PostgREST layer does per request. RLS evaluates against
 * auth.uid() = subject.
 */
export async function asUser(port: number, subject: string, sql: string): Promise<pg.QueryResult> {
  return asUserParams(port, subject, sql, []);
}

/** asUser with parameterized SQL, safe for arbitrary user-controlled values. */
export async function asUserParams(
  port: number,
  subject: string,
  sql: string,
  params: unknown[],
): Promise<pg.QueryResult> {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config($1, $2, true)", [
      "request.jwt.claims",
      JSON.stringify({ sub: subject, role: "authenticated" }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
