#!/usr/bin/env node
/**
 * Starts the production Next.js server for E2E against the local backend.
 * Reads the backend JSON written by start-backend.mjs, builds if needed,
 * then runs `next start` on the requested port.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] ?? 3100);
const backendFile = args[args.indexOf("--backend-file") + 1] ?? ".e2e-backend.json";
const forceBuild = args.includes("--force-build") || process.env.E2E_FORCE_BUILD === "1";
const repo = resolve(process.cwd());

async function readBackend() {
  const file = join(repo, backendFile);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, "utf8"));
      } catch {
        // partial write; retry
      }
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  throw new Error(`backend file ${backendFile} never appeared`);
}

const backend = await readBackend();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: backend.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: backend.serviceRoleKey,
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  AI_MODE: "demo",
  PORT: String(port),
};

const buildIdPath = join(repo, ".next", "BUILD_ID");
if (forceBuild || !existsSync(buildIdPath)) {
  const build = spawn(
    process.execPath,
    [join(repo, "node_modules", "next", "dist", "bin", "next"), "build"],
    {
      stdio: "inherit",
      cwd: repo,
      env,
    },
  );
  const buildCode = await new Promise((resolveCode) => build.on("exit", resolveCode));
  if (buildCode !== 0) {
    process.exit(buildCode ?? 1);
  }
}

const server = spawn(
  process.execPath,
  [join(repo, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)],
  { stdio: "inherit", cwd: repo, env },
);
process.stdout.write(`e2e web server starting on port ${port}\n`);

function cleanup() {
  try {
    server.kill();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
server.on("exit", () => process.exit(0));
