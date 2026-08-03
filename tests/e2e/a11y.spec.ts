import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  expectCleanConsole,
  signUp,
  logIn,
  uniqueEmail,
  uniquePassword,
  backendConfig,
  todayToronto,
  addCalendarDays,
  apiLogin,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

let email: string;
let password: string;
let appId: string;

async function createFixtureUser(page: import("@playwright/test").Page) {
  email = uniqueEmail("a11y");
  password = uniquePassword();
  await signUp(page, email, password, "A11y User");
  const backend = backendConfig();
  const api = await apiLogin(backend, email, password);
  const createApp = await fetch(`${backend.url}/rest/v1/applications`, {
    method: "POST",
    headers: {
      apikey: backend.serviceRoleKey,
      Authorization: `Bearer ${backend.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: api.userId,
      creation_key: crypto.randomUUID(),
      company: "A11y Fixture Co",
      job_title: "A11y Role",
      original_description: "Fixture job",
      status: "saved",
      deadline: addCalendarDays(todayToronto(), 5),
    }),
  });
  appId = (await createApp.json())[0].id;
}

async function axeScan(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  const details = serious
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.length} nodes — ${violation.help}`,
    )
    .join("\n");
  expect(serious, `${label} axe serious/critical violations:\n${details}`).toEqual([]);
}

async function scanModes(page: import("@playwright/test").Page, path: string, label: string) {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.goto(path);
      await page.evaluate((value) => localStorage.setItem("theme", value), theme);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await axeScan(page, `${label} ${width}px ${theme}`);
    }
  }
}

test("fixture user with a populated application @a11y", async ({ page }) => {
  await createFixtureUser(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Total applications")).toBeVisible();
});

test("public pages have no serious/critical axe violations @a11y", async ({ page }) => {
  await page.context().clearCookies();
  await scanModes(page, "/", "landing");
  await scanModes(page, "/login", "login");
  await scanModes(page, "/signup", "signup");
});

test("authenticated pages have no serious/critical axe violations @a11y", async ({ page }) => {
  await logIn(page, email, password);
  await scanModes(page, "/dashboard", "dashboard");
  await scanModes(page, "/analytics", "analytics");
  await scanModes(page, "/applications", "applications");
  await scanModes(page, "/applications/new", "add-job");
  await scanModes(page, "/applications/board", "board");
  await scanModes(page, `/applications/${appId}`, "job-detail");
  await scanModes(page, "/profile", "profile");
  await scanModes(page, "/archive", "archive");
  await scanModes(page, "/settings", "settings");
  await scanModes(page, "/onboarding", "onboarding");
});

test("destructive dialog has no serious/critical axe violations @a11y", async ({ page }) => {
  await logIn(page, email, password);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/applications/${appId}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await axeScan(page, "delete-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

test("dashboard and analytics flows stay console-clean @a11y", async ({ page, consoleErrors }) => {
  await logIn(page, email, password);
  await page.goto("/dashboard");
  await expect(page.getByText("Total applications")).toBeVisible();
  await page.goto("/analytics");
  await expect(page.getByText("How these numbers are calculated")).toBeVisible();
  expectCleanConsole(consoleErrors);
});
