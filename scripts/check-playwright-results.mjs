#!/usr/bin/env node
/**
 * Fails when a Playwright JSON report contains anything that a clean run
 * must not contain:
 *
 * - unexpected (failed) tests
 * - flaky tests (passed only after a retry)
 * - any test whose results used a retry
 * - skipped tests (no intentional skips exist in the suite)
 *
 * Usage:
 *   node scripts/check-playwright-results.mjs <report.json> [<report.json> ...]
 */

import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/check-playwright-results.mjs <report.json> [...]");
  process.exit(2);
}

function walkSuites(suites, visit) {
  for (const suite of suites ?? []) {
    visit(suite);
    walkSuites(suite.suites, visit);
  }
}

let failed = false;

for (const file of files) {
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`check-playwright-results: cannot read ${file}: ${error.message}`);
    failed = true;
    continue;
  }

  const stats = report.stats ?? {};
  const expected = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;

  const retried = [];
  walkSuites(report.suites, (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if ((test.results ?? []).some((result) => result.retry > 0)) {
          retried.push(`${spec.title} [${test.projectName ?? "default"}]`);
        }
      }
    }
  });

  const problems = [];
  if (unexpected > 0) problems.push(`${unexpected} unexpected`);
  if (flaky > 0) problems.push(`${flaky} flaky`);
  if (retried.length > 0)
    problems.push(`${retried.length} tests used retries: ${retried.join(", ")}`);
  if (skipped > 0) problems.push(`${skipped} skipped`);

  if (problems.length > 0) {
    failed = true;
    console.error(
      `check-playwright-results: ${file}: ${problems.join("; ")} (expected=${expected})`,
    );
  } else {
    console.log(
      `check-playwright-results: ${file}: ok (expected=${expected}, unexpected=0, flaky=0, retries=0, skipped=0)`,
    );
  }
}

process.exit(failed ? 1 : 0);
