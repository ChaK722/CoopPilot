import {
  test,
  expect,
  expectCleanConsole,
  logIn,
  signOut,
  signUp,
  uniqueEmail,
  uniquePassword,
  backendConfig,
  apiLogin,
} from "./fixtures";

const DESCRIPTION = [
  "Corepath Labs is hiring a Software Developer Co-op for the fall term.",
  "You will build web features with TypeScript and React, write REST APIs,",
  "and ship to production. Experience with Next.js and PostgreSQL is preferred.",
  "Apply by September 15.",
].join(" ");

test.describe("Phase 7 core MVP path", () => {
  test("signup -> onboarding -> analyze/review/save -> status -> AI -> dashboard -> logout/login persistence", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("core");
    const password = uniquePassword();

    // 1-3. Sign up and complete onboarding.
    await signUp(page, email, password, "Core User");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Total applications")).toBeVisible();
    await expect(page.getByText("Add your first job").first()).toBeVisible();

    // Give the profile one real experience so Demo cover letters are sufficient.
    const backend = backendConfig();
    const api = await apiLogin(backend, email, password);
    await fetch(`${backend.url}/rest/v1/experiences`, {
      method: "POST",
      headers: {
        apikey: backend.serviceRoleKey,
        Authorization: `Bearer ${backend.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: api.userId,
        title: "Software Developer Intern",
        organization: "Demo Corp",
        bullet_points: ["Built REST APIs used by 2,000+ users"],
        sort_order: 0,
      }),
    });
    await fetch(`${backend.url}/rest/v1/profile_skills`, {
      method: "POST",
      headers: {
        apikey: backend.serviceRoleKey,
        Authorization: `Bearer ${backend.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: api.userId,
        category: "programming_languages",
        name: "TypeScript",
        normalized_name: "typescript",
      }),
    });

    // 4-8. Add job: analyze in Demo Mode, correct one field, save.
    await page.goto("/applications/new");
    await page.getByPlaceholder(/Paste the full job posting text/).fill(DESCRIPTION);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.getByRole("button", { name: "Save application" }).waitFor({ timeout: 60_000 });
    await expect(page.getByText("Demo AI Response")).toBeVisible();
    await page.getByLabel("Company").fill("Corepath Labs (edited)");
    await page.getByRole("button", { name: "Save application" }).click();
    await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
    const appId = new URL(page.url()).pathname.split("/")[2];
    await expect(page.getByText("Corepath Labs (edited)")).toBeVisible();

    // 9-10. Change status to Applied through the board (skip the date prompt).
    await page.goto("/applications/board");
    const card = page.locator("a", { hasText: "Corepath Labs (edited)" }).first();
    await card.waitFor();
    const cardRoot = card.locator("xpath=ancestor::div[contains(@class,'relative')]");
    await cardRoot.locator("select").selectOption("applied");
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText("Moved to Applied.")).toBeAttached();

    // 11-12. Generate match and verify the score breakdown.
    await page.goto(`/applications/${appId}`);
    await page.getByRole("button", { name: "Generate match analysis" }).click();
    await expect(page.getByText("/100").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Required skills").first()).toBeVisible();
    await expect(page.getByText("Demo AI Response").first()).toBeVisible();

    // 13-15. Generate cover letter, edit + save a new version, copy feedback.
    await page.getByRole("button", { name: "Generate cover letter" }).click();
    await expect(page.getByText("Version 1")).toBeVisible({ timeout: 90_000 });
    await page.getByLabel("Cover letter").fill("Edited cover letter body for Corepath.");
    await page.getByRole("button", { name: "Save edits" }).click();
    await expect(page.getByText("Version 2").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByText("Copied to clipboard.")).toBeVisible();

    // 16-17. Generate interview prep.
    await page.getByRole("button", { name: "Generate interview prep" }).click();
    await expect(page.getByText("Behavioural questions").first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Technical questions").first()).toBeVisible();
    await expect(page.getByText("Research checklist").first()).toBeVisible();

    // 18. Dashboard/Analytics reconcile (this user has exactly one application).
    await page.goto("/dashboard");
    await expect(page.getByText("Total applications")).toBeVisible();
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("1"),
    ).toBeVisible();
    await expect(page.getByText("Total: 1")).toBeVisible();
    await page.goto("/analytics");
    await expect(page.getByText("How these numbers are calculated")).toBeVisible();
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("1"),
    ).toBeVisible();

    // 19-21. Logout, login again, verify persistence.
    await page.goto("/dashboard");
    await signOut(page);
    await expect(page).toHaveURL(/\/$/);
    await logIn(page, email, password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("1"),
    ).toBeVisible();
    await page.goto("/applications/board");
    await expect(page.locator("a", { hasText: "Corepath Labs (edited)" }).first()).toBeVisible();

    expectCleanConsole(consoleErrors);
  });
});
