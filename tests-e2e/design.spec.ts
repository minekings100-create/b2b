import { test, expect } from "@playwright/test";

test.describe("/design", () => {
  test("renders and toggles between light and dark", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    page.on("console", (m) => {
      if (m.type() === "error") {
        errors.push(`console.error: ${m.text()}`);
      }
    });

    await page.goto("/design");

    // Core content renders
    await expect(
      page.getByRole("heading", { name: "Foundations", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Buttons",   level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tables",    level: 2 })).toBeVisible();

    // Light — explicit, avoids system-preference flakiness
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `artifacts/design-light-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // Dark
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `artifacts/design-dark-${testInfo.project.name}.png`,
      fullPage: true,
    });

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
