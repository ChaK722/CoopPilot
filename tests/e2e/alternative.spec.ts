import {
  test,
  expect,
  expectCleanConsole,
  signUp,
  uniqueEmail,
  uniquePassword,
  todayToronto,
  addCalendarDays,
  backendConfig,
  apiLogin,
} from "./fixtures";

async function restInsertApp(
  backend: { url: string; serviceRoleKey: string },
  userId: string,
  company: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await fetch(`${backend.url}/rest/v1/applications`, {
    method: "POST",
    headers: {
      apikey: backend.serviceRoleKey,
      Authorization: `Bearer ${backend.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      creation_key: crypto.randomUUID(),
      company,
      job_title: company,
      original_description: "Fixture",
      status: "saved",
      ...overrides,
    }),
  });
  if (!response.ok)
    throw new Error(`fixture insert failed: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  return rows[0].id;
}

test.describe("Phase 7 alternative paths", () => {
  test("manual job entry without AI analysis", async ({ page, consoleErrors }) => {
    const email = uniqueEmail("manual");
    const password = uniquePassword();
    await signUp(page, email, password, "Manual User");
    await page.goto("/applications/new");
    await page.getByPlaceholder(/Paste the full job posting text/).fill("Manual description here.");
    await page.getByRole("button", { name: "Skip analysis, enter manually" }).click();
    await page.getByLabel("Company").fill("Manual Co");
    await page.getByLabel("Job title").fill("Manual Intern");
    await page.getByRole("button", { name: "Save application" }).click();
    await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Manual Co")).toBeVisible();
    await expect(page.getByText("Manual Intern")).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("empty dashboard shows actionable zero state", async ({ page, consoleErrors }) => {
    const email = uniqueEmail("empty");
    const password = uniquePassword();
    await signUp(page, email, password, "Empty User");
    await page.goto("/dashboard");
    await expect(page.getByText("Add your first job").first()).toBeVisible();
    await expect(page.getByText("No applied applications yet").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Add your first job/ })).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("deadline boundary: day 7 upcoming, day 8 excluded, expired needs action", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("deadline");
    const password = uniquePassword();
    await signUp(page, email, password, "Deadline User");
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);
    const today = todayToronto();
    await restInsertApp(backend, api.userId, "Due In Seven", {
      deadline: addCalendarDays(today, 7),
      status: "saved",
    });
    await restInsertApp(backend, api.userId, "Due In Eight", {
      deadline: addCalendarDays(today, 8),
      status: "saved",
    });
    await restInsertApp(backend, api.userId, "Due In Three", {
      deadline: addCalendarDays(today, 3),
      status: "saved",
    });
    await restInsertApp(backend, api.userId, "Expired Saved", {
      deadline: addCalendarDays(today, -1),
      status: "saved",
    });

    await page.goto("/dashboard");
    const upcomingSection = page.getByLabel("Upcoming deadlines");
    await expect(upcomingSection.getByText("Due In Seven").first()).toBeVisible();
    await expect(upcomingSection.getByText("Due In Eight")).not.toBeVisible();
    await expect(upcomingSection.getByText("Due In Three").first()).toBeVisible();
    await expect(page.getByText("Expired Saved").first()).toBeVisible();
    await expect(page.getByText("Deadline passed").first()).toBeVisible();
    const actionSection = page.getByLabel("Applications requiring action");
    await expect(actionSection.getByText("Apply before deadline").first()).toBeVisible();
    await expect(actionSection.getByText("Due In Three").first()).toBeVisible();

    // Board badge for the expired saved application.
    await page.goto("/applications/board");
    await expect(page.locator("a", { hasText: "Expired Saved" }).first()).toBeVisible();
    await expect(page.getByText("Deadline passed").first()).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("repeated Analyze clicks produce one review and one application", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("dupe");
    const password = uniquePassword();
    await signUp(page, email, password, "Dupe User");
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);

    await page.goto("/applications/new");
    await page
      .getByPlaceholder(/Paste the full job posting text/)
      .fill("Duplicate click job description.");

    // One real first click starts the single analysis.
    const analyzeButton = page.getByRole("button", { name: "Analyze", exact: true });
    await analyzeButton.click();

    // The control is disabled for the whole analysis, so a fast second user
    // action (Enter) cannot start another submission.
    const analyzingButton = page.getByRole("button", { name: /Analyzing/ });
    await expect(analyzingButton).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect(analyzingButton).toBeDisabled();

    // Exactly one review form appears once the single analysis completes.
    const saveButton = page.getByRole("button", { name: "Save application", exact: true });
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Save application" })).toHaveCount(1);

    // Server-side: exactly one AI run was created for the analysis.
    const runsResponse = await fetch(
      `${backend.url}/rest/v1/ai_runs?select=id&user_id=eq.${api.userId}`,
      {
        headers: {
          apikey: backend.serviceRoleKey,
          Authorization: `Bearer ${backend.serviceRoleKey}`,
        },
      },
    );
    expect(runsResponse.ok).toBe(true);
    const runs = await runsResponse.json();
    expect(runs).toHaveLength(1);

    await saveButton.click();
    await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);

    // Server-side: exactly one application exists for the user.
    const appsResponse = await fetch(
      `${backend.url}/rest/v1/applications?select=id&user_id=eq.${api.userId}`,
      {
        headers: {
          apikey: backend.serviceRoleKey,
          Authorization: `Bearer ${backend.serviceRoleKey}`,
        },
      },
    );
    expect(appsResponse.ok).toBe(true);
    const apps = await appsResponse.json();
    expect(apps).toHaveLength(1);

    await page.goto("/dashboard");
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("1"),
    ).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("archive removes from dashboard, restore brings it back", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("archive");
    const password = uniquePassword();
    await signUp(page, email, password, "Archive User");
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);
    const appId = await restInsertApp(backend, api.userId, "Archive Me");

    await page.goto(`/applications/${appId}`);
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await page.waitForURL(/\/applications$/);
    await page.goto("/dashboard");
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("0"),
    ).toBeVisible();

    await page.goto("/archive");
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Application restored.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No archived applications")).toBeVisible({ timeout: 15_000 });
    await page.goto("/dashboard");
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("1"),
    ).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("delete cancel keeps the application; confirm cascades it away", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("delete");
    const password = uniquePassword();
    await signUp(page, email, password, "Delete User");
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);
    const appId = await restInsertApp(backend, api.userId, "Delete Me");

    await page.goto(`/applications/${appId}`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Delete Me")).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/applications$/);
    await page.goto("/dashboard");
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("0"),
    ).toBeVisible();
    expectCleanConsole(consoleErrors);
  });

  test("generated match appears as the latest score on the board card", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("boardscore");
    const password = uniquePassword();
    await signUp(page, email, password, "Score User");
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);
    const appId = await restInsertApp(backend, api.userId, "Score Co");
    // Add application skills so the demo match has something to score.
    await fetch(`${backend.url}/rest/v1/application_skills`, {
      method: "POST",
      headers: {
        apikey: backend.serviceRoleKey,
        Authorization: `Bearer ${backend.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: api.userId,
        application_id: appId,
        requirement_type: "required",
        name: "TypeScript",
        normalized_name: "typescript",
        sort_order: 0,
      }),
    });

    await page.goto(`/applications/${appId}`);
    await page.getByRole("button", { name: "Generate match analysis" }).click();
    await expect(page.getByText("/100").first()).toBeVisible({ timeout: 90_000 });
    const scoreText = await page.getByText(/\/100/).first().textContent();
    const score = Number(scoreText?.match(/(\d{1,3})\/100/)?.[1]);
    expect(Number.isInteger(score)).toBe(true);

    await page.goto("/applications/board");
    const card = page.locator("a", { hasText: "Score Co" }).first();
    await expect(card).toBeVisible();
    await expect(page.getByText(`Match: ${score}/100`).first()).toBeVisible();
    expectCleanConsole(consoleErrors);
  });
});
