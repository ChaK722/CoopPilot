#!/usr/bin/env node
/**
 * Starts the Next.js DEV server for the AI-failure E2E project, where the
 * test-only E2E_AI_FAILURE hook is allowed (non-production, localhost only).
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] ?? 3102);
const backendFile = args[args.indexOf("--backend-file") + 1] ?? ".e2e-backend-failure.json";
const repo = resolve(process.cwd());

async function readBackend() {
  const file = join(repo, backendFile);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, "utf8"));
      } catch {
        // retry
      }
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  throw new Error(`backend file ${backendFile} never appeared`);
}

const backend = await readBackend();
// Next dev bakes NEXT_PUBLIC_* values at compile time; a stale .next from
// another environment would point the browser bundle at the wrong backend.
rmSync(join(repo, ".next"), { recursive: true, force: true });
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: backend.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: backend.serviceRoleKey,
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  AI_MODE: "demo",
  E2E_AI_FAILURE: "1",
};

const dev = spawn(
  process.execPath,
  [join(repo, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port)],
  {
    stdio: "inherit",
    cwd: repo,
    env,
  },
);
process.stdout.write(`e2e dev server (AI failure) starting on port ${port}\n`);

function cleanup() {
  try {
    dev.kill();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
dev.on("exit", () => process.exit(0));
