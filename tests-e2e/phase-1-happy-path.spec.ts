import { test, expect } from "@playwright/test";

/**
 * SPEC §11 / §12 — Phase 1 happy path. Seeded users from scripts/seed.ts must
 * land on their role-scoped dashboard and see the expected sidebar sections.
 */

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.describe("Phase 1 happy path", () => {
  test("branch user lands on their dashboard", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Phase 7a replaced the empty-state stub with stat cards. Assert
    // the branch-user trio renders.
    await expect(page.getByTestId("stat-open-orders")).toBeVisible();
  });

  test("branch manager sees the Approvals link", async ({ page }) => {
    await signIn(page, "ams.mgr@example.nl");
    await expect(page.getByRole("link", { name: "Approvals" })).toBeVisible();
  });

  test("super admin sees the Admin section", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await expect(page.getByRole("link", { name: "Catalog" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  test("cmd+k opens the command palette", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.keyboard.press("Control+K");
    await expect(page.getByPlaceholder("Search or jump to…")).toBeVisible();
  });
});
