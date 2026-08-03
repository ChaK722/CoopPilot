import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const wrapper = join(repo, "scripts", "run-vitest-clean.mjs");

function runFixture(name: string) {
  const fixture = join(repo, "tests", "fixtures", "vitest-gate", `${name}.mjs`);
  return spawnSync(process.execPath, [wrapper], {
    cwd: repo,
    env: { ...process.env, VITEST_CLEAN_CMD: `node "${fixture}"` },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("run-vitest-clean log gate", () => {
  it("passes clean output through and exits 0", () => {
    const result = runFixture("clean");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("vitest-gate fixture: clean");
  });

  it("fails on a React act warning even when the child exits 0", () => {
    const result = runFixture("act-warning");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forbidden log patterns detected");
    expect(result.stderr).toContain("React act warning");
    expect(result.stderr).toContain("not wrapped in act");
  });

  it("fails on a jsdom navigation warning even when the child exits 0", () => {
    const result = runFixture("jsdom-navigation");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("jsdom navigation warning");
    expect(result.stderr).toContain("Not implemented: navigation to another Document");
  });

  it("fails on a real React hydration warning message", () => {
    const result = runFixture("hydration-warning");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("React hydration warning");
  });

  it("preserves the child's original non-zero exit code", () => {
    const result = runFixture("failing");
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("vitest-gate fixture: failing");
    expect(result.stderr).toContain("boom");
  });
});
