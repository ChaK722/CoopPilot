#!/usr/bin/env node
/**
 * Runs `vitest run` and fails the process when the output contains known
 * React/Vite/jsdom log noise even if Vitest itself exited 0:
 *
 * - React act warnings:  "not wrapped in act(...)"
 * - jsdom navigation:    "Not implemented: navigation to another Document"
 * - Vite config loader:  "unsupported by configLoader"
 * - React hydration:     actual React hydration warning messages (matched by
 *                         their real wording, never the bare word "hydration")
 *
 * The child's stdout/stderr is forwarded in real time and captured for the
 * scan. Vitest's original exit code is preserved; a non-zero exit code is
 * returned when forbidden patterns are found in an otherwise green run.
 *
 * For unit tests, VITEST_CLEAN_CMD may override the spawned command line
 * (quote-aware). The default command is `node node_modules/vitest/vitest.mjs
 * run`, which works on Windows and Linux without .bin shims.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_PATTERNS = [
  {
    name: "React act warning",
    test: (text) => text.includes("not wrapped in act"),
  },
  {
    name: "jsdom navigation warning",
    test: (text) => text.includes("Not implemented: navigation to another Document"),
  },
  {
    name: "Vite config loader warning",
    test: (text) => text.includes("unsupported by configLoader"),
  },
  {
    name: "React hydration warning",
    test: (text) =>
      /Hydration failed because the server rendered HTML didn't match the client|Text content did not match|There was an error while hydrating|A tree hydrated but some attributes of the server rendered HTML didn't match/i.test(
        text,
      ),
  },
];

function splitCommandLine(line) {
  const parts = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  return parts;
}

function resolveCommand() {
  const override = process.env.VITEST_CLEAN_CMD?.trim();
  if (override) {
    return splitCommandLine(override);
  }
  const vitestBin = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitestBin)) {
    console.error(`run-vitest-clean: cannot find ${vitestBin}`);
    process.exit(2);
  }
  return [process.execPath, vitestBin, "run"];
}

const [command, ...args] = resolveCommand();
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});
child.on("error", (error) => {
  console.error(`run-vitest-clean: failed to start "${command}": ${error.message}`);
  process.exit(2);
});
child.on("close", (code) => {
  const hits = FORBIDDEN_PATTERNS.filter((pattern) => pattern.test(output));
  if (hits.length > 0) {
    const names = hits.map((pattern) => pattern.name).join(", ");
    process.stderr.write(`run-vitest-clean: forbidden log patterns detected: ${names}\n`);
    process.exitCode = code === 0 ? 1 : code;
    return;
  }
  process.exitCode = code ?? 1;
});
