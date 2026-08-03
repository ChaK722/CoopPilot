import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 54329;
const WEB_PORT = 3100;

/**
 * E2E runs against a repeatable local backend (tinbase, in-memory/temp data
 * dir, migrations applied on boot) and a production `next start` server
 * built with that backend's URL. The AI-failure project deliberately uses a
 * dev server so the test-only `E2E_AI_FAILURE` hook stays outside
 * production.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: [
    {
      command: `node scripts/e2e/start-backend.mjs --port ${BACKEND_PORT} --out .e2e-backend.json`,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node scripts/e2e/start-web.mjs --port ${WEB_PORT} --backend-file .e2e-backend.json --force-build`,
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/a11y\.spec\.ts/, /ai-failure\.spec\.ts/],
    },
    {
      name: "a11y",
      grep: /@a11y/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
