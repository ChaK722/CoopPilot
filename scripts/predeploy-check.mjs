#!/usr/bin/env node
/**
 * Pre-deployment gate. Verifies everything that can be verified without
 * production credentials: clean build, env schema, migration ordering and
 * cleanliness, test-only flag absence, secret scan, and required docs.
 * Never prints secret values.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local values (names only; never printed) so the gate passes in
// a configured local checkout and fails cleanly in a bare one.
const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileLines(envFile)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function readFileLines(file) {
  return readFileSync(file, "utf8").split(/\r?\n/);
}

const failures = [];
const notes = [];

function check(name, ok, detail = "") {
  if (ok) {
    notes.push(`ok: ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

// 1. Clean production build.
try {
  execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    stdio: "pipe",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "ci-placeholder-anon-key",
    },
    timeout: 600_000,
  });
  check("clean production build", true);
} catch (error) {
  check("clean production build", false, String(error?.message ?? error).slice(0, 300));
}

// 2. Environment schema (names only; values are never printed).
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
check("NEXT_PUBLIC_SUPABASE_URL set", Boolean(publicUrl?.trim()));
check("NEXT_PUBLIC_SUPABASE_ANON_KEY set", Boolean(anonKey?.trim()));
check("NEXT_PUBLIC_SUPABASE_URL is http(s)", /^https?:\/\//.test(publicUrl ?? ""));
check("NEXT_PUBLIC_SUPABASE_ANON_KEY is not a placeholder", !anonKey?.includes("replace-with-"));
if (process.env.NODE_ENV === "production") {
  const loopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl ?? "");
  check(
    "NEXT_PUBLIC_APP_URL is HTTPS (or loopback for local E2E)",
    /^https:\/\//.test(appUrl ?? "") || loopback,
  );
}
const aiMode = process.env.AI_MODE ?? "demo";
check("AI_MODE is demo (MVP)", aiMode === "demo");
check(
  "E2E test flags absent in production",
  process.env.NODE_ENV !== "production" || !process.env.E2E_AI_FAILURE,
);

// 3. Migrations: ordered, unique timestamps, no uncommitted changes.
const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrations = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
  : [];
const timestamps = migrations.map((name) => name.match(/^\d+/)?.[0] ?? "");
check(
  "migrations sorted and unique",
  timestamps.length > 0 && new Set(timestamps).size === timestamps.length,
);
try {
  const status = execFileSync("git", ["status", "--porcelain", "--", "supabase/migrations"], {
    encoding: "utf8",
  }).trim();
  check("no uncommitted migrations", status === "", status.slice(0, 300));
} catch (error) {
  check("no uncommitted migrations", false, String(error?.message ?? error).slice(0, 200));
}

// 4. Secret scan.
try {
  execFileSync(process.execPath, ["scripts/secret-scan.mjs"], { stdio: "pipe" });
  check("secret scan", true);
} catch {
  check("secret scan", false);
}

// 5. Required documentation exists.
const requiredDocs = [
  "README.md",
  "docs/implementation-plan.md",
  "docs/requirements.md",
  "docs/architecture.md",
  "docs/database-schema.md",
  "docs/manual-test-checklist.md",
  "docs/deployment.md",
  "docs/production-smoke-test.md",
  "docs/security-audit.md",
  "docs/accessibility-audit.md",
  "docs/performance-audit.md",
];
for (const doc of requiredDocs) {
  check(`docs present: ${doc}`, existsSync(join(process.cwd(), doc)));
}

console.log(notes.join("\n"));
if (failures.length > 0) {
  console.error("\npredeploy:check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log("\npredeploy:check passed.");
