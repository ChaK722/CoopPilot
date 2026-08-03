/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures use `use`, not React hooks */
import { expect, test as base, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ConsoleErrors {
  pageErrors: string[];
  consoleErrors: string[];
  hydrationWarnings: string[];
  failedRequests: string[];
}

export const test = base.extend<{ consoleErrors: ConsoleErrors }>({
  consoleErrors: async ({ page }, use) => {
    const errors: ConsoleErrors = {
      pageErrors: [],
      consoleErrors: [],
      hydrationWarnings: [],
      failedRequests: [],
    };
    page.on("pageerror", (error) => {
      errors.pageErrors.push(`pageerror: ${error.message}`);
    });
    page.on("console", (message) => {
      const text = message.text();
      // Dev-only HMR transport noise: the test browser cannot complete the
      // webpack-hmr WebSocket handshake on `next dev`. The production server
      // used by every other project has no such endpoint. Precisely scoped
      // to /_next/webpack-hmr websocket errors.
      if (message.type() === "error" && text.includes("/_next/webpack-hmr")) {
        return;
      }
      if (message.type() === "error") {
        errors.consoleErrors.push(`console: ${text}`);
      }
      if (/hydration/i.test(text)) {
        errors.hydrationWarnings.push(`hydration: ${text}`);
      }
    });
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (url.includes("favicon")) return;
      // net::ERR_ABORTED means the BROWSER cancelled the request because the
      // page navigated away (Link click, router.refresh/replace, test-driven
      // goto, or cookie clearing). The server never failed; Playwright
      // reports the client-side cancellation. Every other failure mode stays
      // strict. Documented in docs/accessibility-audit.md and
      // docs/security-audit.md.
      if (request.failure()?.errorText === "net::ERR_ABORTED") {
        return;
      }
      errors.failedRequests.push(
        `requestfailed: ${url} ${request.failure()?.errorText ?? "unknown"}`,
      );
    });
    await use(errors);
  },
});

export { expect } from "@playwright/test";

/** Fails a test when the page produced any unexpected console/page noise. */
export function expectCleanConsole(errors: ConsoleErrors) {
  if (
    errors.pageErrors.length > 0 ||
    errors.consoleErrors.length > 0 ||
    errors.hydrationWarnings.length > 0 ||
    errors.failedRequests.length > 0
  ) {
    console.error("console noise:", JSON.stringify(errors, null, 2));
  }
  expect(errors.pageErrors, "unexpected page errors").toEqual([]);
  expect(errors.consoleErrors, "unexpected console errors").toEqual([]);
  expect(errors.hydrationWarnings, "hydration warnings").toEqual([]);
  expect(errors.failedRequests, "failed requests").toEqual([]);
}

let emailCounter = 0;

export function uniqueEmail(prefix = "e2e"): string {
  emailCounter += 1;
  const stamp = `${Date.now()}-${emailCounter}`;
  return `${prefix}-${stamp}@example.test`;
}

export function uniquePassword(): string {
  return `E2ePass-${Date.now()}-${emailCounter}`;
}

/** Today's calendar date in America/Toronto (YYYY-MM-DD). */
export function todayToronto(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Reads the backend JSON written by scripts/e2e/start-backend.mjs. */
export function backendConfig(file = ".e2e-backend.json"): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  port: number;
} {
  return JSON.parse(readFileSync(join(process.cwd(), file), "utf8"));
}

export async function apiLogin(
  backend: ReturnType<typeof backendConfig>,
  email: string,
  password: string,
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(`${backend.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: backend.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`api login failed: ${response.status}`);
  const session = await response.json();
  const me = await fetch(`${backend.url}/auth/v1/user`, {
    headers: { apikey: backend.anonKey, Authorization: `Bearer ${session.access_token}` },
  });
  if (!me.ok) throw new Error(`api user lookup failed: ${me.status}`);
  const user = await me.json();
  return { accessToken: session.access_token, userId: user.id };
}

export async function signUp(
  page: Page,
  email: string,
  password: string,
  preferredName = "E2E User",
): Promise<void> {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await waitForHydration(page, "#signup-email");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /Create account|Sign up/i }).click();
    try {
      // Signup may land on onboarding or dashboard depending on profile state.
      await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 30_000 });
      break;
    } catch {
      // A native GET submission means React had not hydrated yet; the page
      // reloaded and the next attempt happens against cached chunks.
      await page.waitForLoadState("networkidle");
      await waitForHydration(page, "#signup-email");
    }
  }
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/onboarding")) {
    await page.getByLabel("Preferred name").fill(preferredName);
    await page.getByRole("button", { name: "Finish onboarding" }).click();
    await page.waitForURL(/\/dashboard/);
    await page.waitForLoadState("domcontentloaded");
  }
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await waitForHydration(page, "#login-email");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /Log in|Sign in/i }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
      break;
    } catch {
      await page.waitForLoadState("networkidle");
      await waitForHydration(page, "#login-email");
    }
  }
  await page.waitForLoadState("domcontentloaded");
}

async function waitForHydration(page: Page, selector: string): Promise<void> {
  // React attaches props (including onChange/onSubmit handlers) to hydrated
  // form controls. Without waiting, a slow first compile on `next dev` can
  // leave forms without their submit handlers, causing native GET
  // submissions that wipe the entered values.
  await page
    .waitForFunction(
      (elementSelector) => {
        const element = document.querySelector(elementSelector);
        return Boolean(
          element && Object.keys(element).some((key) => key.startsWith("__reactProps")),
        );
      },
      selector,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/$/);
}

export async function addApplicationViaAnalyze(
  page: Page,
  description: string,
  companyOverride?: string,
): Promise<string> {
  await page.goto("/applications/new");
  await page.getByPlaceholder(/Paste the full job posting text/).fill(description);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByRole("button", { name: "Save application" }).waitFor({ timeout: 60_000 });
  if (companyOverride) {
    const companyInput = page.getByLabel("Company");
    await companyInput.fill(companyOverride);
  }
  await page.getByRole("button", { name: "Save application" }).click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}
