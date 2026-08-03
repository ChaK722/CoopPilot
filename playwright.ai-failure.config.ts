import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 54330;
const WEB_PORT = 3102;

/**
 * Runs the AI-failure fallback spec against a dev server with the test-only
 * E2E_AI_FAILURE flag. A separate config keeps the production `next start`
 * server (used by every other project) free of test-only behavior.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ai-failure\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-ai-failure" }]],
  webServer: [
    {
      command: `node scripts/e2e/start-backend.mjs --port ${BACKEND_PORT} --out .e2e-backend-failure.json`,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node scripts/e2e/start-web-dev.mjs --port ${WEB_PORT} --backend-file .e2e-backend-failure.json`,
      url: `http://127.0.0.1:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
