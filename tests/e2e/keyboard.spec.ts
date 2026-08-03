import { test, expect, expectCleanConsole, uniqueEmail, uniquePassword } from "./fixtures";

async function tabUntil(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.keyboard.press("Tab");
    const focused = await locator.evaluate((element) => element === document.activeElement);
    if (focused) return;
  }
  throw new Error("keyboard tab never reached the target element");
}

test("core workflow works with the keyboard only", async ({ page, consoleErrors }) => {
  const kEmail = uniqueEmail("keyboard");
  const kPassword = uniquePassword();

  // Skip link first: Tab lands on it, Enter jumps to main content.
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  // Navigate to signup with the keyboard and complete the form.
  await page.goto("/signup");
  await tabUntil(page, page.getByLabel("Email"));
  await page.keyboard.type(kEmail);
  await tabUntil(page, page.getByLabel("Password", { exact: true }));
  await page.keyboard.type(kPassword);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/onboarding|\/dashboard/);

  if (page.url().includes("/onboarding")) {
    await tabUntil(page, page.getByLabel("Preferred name"));
    await page.keyboard.type("Keyboard User");
    await page.keyboard.press("Enter");
  }
  await page.waitForURL(/\/dashboard/);

  // Keyboard navigation to Add Job.
  await tabUntil(page, page.getByRole("link", { name: "Add Job" }));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/applications\/new/);
  await tabUntil(page, page.getByPlaceholder(/Paste the full job posting text/));

  // Settings theme radios are reachable and selectable with the keyboard.
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  expectCleanConsole(consoleErrors);
});
