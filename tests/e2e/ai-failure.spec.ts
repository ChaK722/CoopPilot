import { test, expect, expectCleanConsole, signUp, uniqueEmail, uniquePassword } from "./fixtures";

test.describe("AI failure fallback (test-only E2E hook, dev server)", () => {
  test("Analyze failure shows a safe error and manual entry remains usable", async ({
    page,
    consoleErrors,
  }) => {
    const email = uniqueEmail("aifail");
    const password = uniquePassword();
    await signUp(page, email, password, "AI Fail User");

    await page.goto("/applications/new");
    await page.waitForLoadState("networkidle");
    await page
      .getByPlaceholder(/Paste the full job posting text/)
      .fill("Job that cannot be analyzed.");
    await page.getByRole("button", { name: "Analyze" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Something went wrong/)).toBeVisible();
    await expect(page.getByText(/Reference: /)).toBeVisible();

    await page.getByRole("button", { name: "Skip analysis, enter manually" }).click();
    await page.getByLabel("Company").fill("Fallback Co");
    await page.getByLabel("Job title").fill("Fallback Role");
    await page.getByRole("button", { name: "Save application" }).click();
    await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Fallback Co")).toBeVisible();
    expectCleanConsole(consoleErrors);
  });
});
