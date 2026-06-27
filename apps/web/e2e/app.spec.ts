import { test, expect } from "@playwright/test";

/* End-to-end through the live app (web :5173 + API :3001 via the Vite proxy).
   Run-unique business so re-runs don't collide on tenant slug. */
const RUN = Date.now();
const BUSINESS = `E2E Cafe ${RUN}`;
const EMAIL = `e2e${RUN}@test.dev`;
const PASSWORD = "hunter2hunter2";

test("marketing landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Loyalty cards your customers actually keep/i })).toBeVisible();
  await page.screenshot({ path: "e2e/__screenshots__/landing.png" });
});

test("auth guard redirects unauthenticated /app to /login", async ({ page }) => {
  await page.goto("/app");
  await page.waitForURL("**/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("signup -> dashboard -> every app page renders -> logout", async ({ page }) => {
  // --- signup ---
  // Type with real key events (pressSequentially) so React's controlled-input
  // onChange runs per keystroke - plain fill() can outrun React state.
  await page.goto("/signup");
  const bizField = page.getByPlaceholder("Business name");
  const emailField = page.getByPlaceholder("you@business.com");
  const pwField = page.getByPlaceholder("Password (min 12 characters)");
  await emailField.waitFor({ state: "visible" });
  await bizField.click();
  await bizField.pressSequentially(BUSINESS);
  await emailField.click();
  await emailField.pressSequentially(EMAIL);
  await pwField.click();
  await pwField.pressSequentially(PASSWORD);
  await expect(emailField).toHaveValue(EMAIL);
  await expect(pwField).toHaveValue(PASSWORD);
  await page.getByRole("button", { name: /create business/i }).click();

  // --- dashboard (authenticated) ---
  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Active members")).toBeVisible();
  await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();
  await page.screenshot({ path: "e2e/__screenshots__/dashboard.png" });

  // --- every authenticated page mounts under the AppShell (Log out present, no crash) ---
  for (const path of [
    "/app/builder",
    "/app/members",
    "/app/staff",
    "/app/analytics",
    "/app/issue",
    "/app/scan",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();
    // the Lovalte app-shell brand proves the page rendered inside the shell, not an error boundary
    await expect(page.getByRole("link", { name: /lovalte/i })).toBeVisible();
  }

  // a couple of page-specific assertions
  await page.goto("/app/scan");
  await expect(page.getByRole("heading", { name: /scan a card/i })).toBeVisible();
  await page.goto("/app/members");
  await expect(page.getByText(/no members yet|members/i).first()).toBeVisible();

  // --- logout ---
  await page.goto("/app");
  await page.getByRole("button", { name: /log out/i }).click();
  await page.waitForURL("**/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // --- log back in by email only (no slug) ---
  const loginEmail = page.getByPlaceholder("you@business.com");
  await loginEmail.click();
  await loginEmail.pressSequentially(EMAIL);
  const loginPw = page.getByPlaceholder("Password", { exact: true });
  await loginPw.click();
  await loginPw.pressSequentially(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
