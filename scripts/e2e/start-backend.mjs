#!/usr/bin/env node
/**
 * Repeatable E2E backend: starts tinbase on an isolated port with a fresh
 * temporary data directory, waits for health, writes the backend URLs and
 * development keys to a JSON file, and runs until killed. Migrations are
 * applied by tinbase on boot from supabase/migrations.
 */

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] ?? process.env.TINBASE_PORT ?? 54329);
const outFile = args[args.indexOf("--out") + 1] ?? ".e2e-backend.json";
const repo = resolve(process.cwd());
const dataDir = mkdtempSync(join(tmpdir(), "cooppilot-e2e-"));

/**
 * Kills any process currently listening on the target port. On Windows the
 * tinbase server process can outlive its parent CLI, so teardown reclaims
 * the port instead of leaking it into the next run.
 */
function killPortOwner(targetPort) {
  try {
    const netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    const lines = netstat
      .split(/\r?\n/)
      .filter((line) => line.includes(`:${targetPort}`) && line.includes("LISTENING"));
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && Number(pid) !== process.pid) {
        try {
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
          } else {
            process.kill(Number(pid), "SIGKILL");
          }
        } catch {
          // already gone
        }
      }
    }
  } catch {
    // netstat unavailable; the fresh temp port is usually free anyway
  }
}

killPortOwner(port);

// tinbase's package.json exports map does not expose ./dist/cli.js, so use
// the absolute file path directly (same file referenced by its "bin").
const tinbaseBin = join(repo, "node_modules", "tinbase", "dist", "cli.js");

const child = spawn(
  process.execPath,
  [
    tinbaseBin,
    "start",
    "--port",
    String(port),
    "--data-dir",
    dataDir,
    "--storage-dir",
    `${dataDir}-storage`,
    "--dir",
    repo,
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: repo,
  },
);

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += String(chunk);
});
child.stderr.on("data", (chunk) => {
  stdout += String(chunk);
});

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "healthy") return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  throw new Error("timed out waiting for tinbase health");
}

function extractKey(label) {
  const match = stdout.match(new RegExp(`${label}:\\s*(eyJ[A-Za-z0-9._-]+)`));
  return match ? match[1] : null;
}

async function main() {
  try {
    await waitForHealth(90_000);
    // Keys are printed to stdout after boot; poll briefly if needed.
    for (
      let attempt = 0;
      attempt < 20 && !(extractKey("anon key") && extractKey("service_role key"));
      attempt += 1
    ) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    const payload = {
      url: `http://127.0.0.1:${port}`,
      anonKey: extractKey("anon key"),
      serviceRoleKey: extractKey("service_role key"),
      port,
    };
    if (!payload.anonKey || !payload.serviceRoleKey) {
      throw new Error(`could not read tinbase keys; stdout tail:\n${stdout.slice(-2000)}`);
    }
    writeFileSync(join(repo, outFile), JSON.stringify(payload, null, 2));
    process.stdout.write(`e2e backend ready on port ${port}\n`);
  } catch (error) {
    process.stderr.write(`start-backend failed: ${String(error)}\n`);
    child.kill();
    process.exit(1);
  }
}

function cleanup() {
  try {
    child.kill();
  } catch {}
  killPortOwner(port);
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
child.on("exit", () => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

await main();
