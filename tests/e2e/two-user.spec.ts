import {
  test,
  expect,
  expectCleanConsole,
  signUp,
  uniqueEmail,
  uniquePassword,
  backendConfig,
  apiLogin,
} from "./fixtures";

test.describe("Phase 7 two-user isolation", () => {
  test("user B cannot see, open, mutate, or read user A's data", async ({
    page,
    consoleErrors,
  }) => {
    const backend = backendConfig();
    const emailA = uniqueEmail("iso-a");
    const passwordA = uniquePassword();
    const emailB = uniqueEmail("iso-b");
    const passwordB = uniquePassword();

    // User A: sign up, complete onboarding, create an application.
    await signUp(page, emailA, passwordA, "Isolation A");
    const apiA = await apiLogin(backend, emailA, passwordA);
    const userIdA = apiA.userId;
    const createApp = await fetch(`${backend.url}/rest/v1/applications`, {
      method: "POST",
      headers: {
        apikey: backend.serviceRoleKey,
        Authorization: `Bearer ${backend.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userIdA,
        creation_key: crypto.randomUUID(),
        company: "Isolation Secret Co",
        job_title: "Secret Role",
        original_description: "Secret job",
        status: "saved",
      }),
    });
    const appA = (await createApp.json())[0];

    // User B: sign up in a fresh context (new page) and verify isolation.
    await page.goto("about:blank");
    await page.context().clearCookies();
    await signUp(page, emailB, passwordB, "Isolation B");
    await page.goto("/dashboard");
    await expect(
      page.locator("div.rounded-lg", { hasText: "Total applications" }).getByText("0"),
    ).toBeVisible();
    await expect(page.getByText("Isolation Secret Co")).not.toBeVisible();

    await page.goto(`/applications/${appA.id}`);
    await expect(page.getByText("Page not found").first()).toBeVisible();

    // Direct RLS check: B's session token cannot read A's application.
    const apiB = await apiLogin(backend, emailB, passwordB);
    const readB = await fetch(`${backend.url}/rest/v1/applications?id=eq.${appA.id}`, {
      headers: {
        apikey: backend.anonKey,
        Authorization: `Bearer ${apiB.accessToken}`,
      },
    });
    expect(await readB.json()).toEqual([]);

    // A's data is still intact for A.
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Password", { exact: true }).fill(passwordA);
    await page.getByRole("button", { name: /Log in|Sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto(`/applications/${appA.id}`);
    await expect(page.getByText("Isolation Secret Co")).toBeVisible();
    expectCleanConsole(consoleErrors);
  });
});
