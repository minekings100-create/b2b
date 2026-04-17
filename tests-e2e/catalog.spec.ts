import { test, expect } from "@playwright/test";

/**
 * Phase 2.1 smoke — `/catalog` must render end-to-end for an authenticated
 * user, including pagination controls and the detail drawer. Guards against
 * the Slot / `React.Children.only` regression that shipped in the initial PR.
 */

async function signInAsSuper(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("super@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.describe("Phase 2.1 catalog browse", () => {
  test("renders without runtime errors for super admin", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signInAsSuper(page);
    await page.goto("/catalog");

    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
    await expect(page.getByPlaceholder("Search SKU or name")).toBeVisible();
    await expect(page.getByRole("link", { name: "Previous" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next" })).toBeVisible();

    expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("row click opens the detail drawer", async ({ page }) => {
    await signInAsSuper(page);
    await page.goto("/catalog");

    // First data row — any will do.
    const firstRowLink = page.locator("tbody tr a").first();
    await firstRowLink.click();
    await expect(page).toHaveURL(/pid=/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Availability")).toBeVisible();

    // Close via Escape.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).not.toHaveURL(/pid=/);
  });
});
