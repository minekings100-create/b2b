import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe("auth", () => {
  const email = `e2e_${Date.now()}@rls.test`;
  const password = "e2e-test-password-1";
  let userId: string;

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "E2E Test User" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("password login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Procurement" })).toBeVisible();

    await page.getByLabel("Email").first().fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // 1.3 renders the email in both the sidebar user menu and the page
    // header, so scope the assertion to the header copy.
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  });

  test("invalid password shows inline error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill(email);
    await page.getByLabel("Password").fill("wrong-password-xxx");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Procurement" })).toBeVisible();
  });

  test("sign out returns to /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login", { timeout: 10_000 });
  });
});
