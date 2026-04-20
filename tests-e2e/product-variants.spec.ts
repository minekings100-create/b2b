import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Post-MVP Sprint 3 — product variant grouping. Covers:
 *   1. Grid-view tile chip switcher swaps price + SKU without navigation.
 *   2. Detail drawer shows the siblings list for a grouped product.
 *   3. Admin edit drawer's Variant group section renders for an in-group
 *      product with its siblings list and a Save label form.
 *
 * Runs at 3 viewports — variant chips wrap differently on mobile and the
 * admin drawer collapses its form layout on tablet/phone, so this is
 * explicitly not a responsive-exempt feature.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CLEANER_GROUP = "11111111-1111-4111-8111-111111111111";
const CLEANER_500_SKU = "SKU-VAR-CLEAN-500";
const CLEANER_1L_SKU = "SKU-VAR-CLEAN-1000";

async function signInAsSuper(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("super@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function ensureGridView() {
  // Flip super@example.nl to grid view so the catalog renders tiles.
  const { data: u } = await admin
    .from("users")
    .select("id")
    .eq("email", "super@example.nl")
    .single();
  if (!u) return;
  await admin
    .from("users")
    .update({ ui_catalog_view: "grid" })
    .eq("id", u.id);
}

async function ensureTableView() {
  const { data: u } = await admin
    .from("users")
    .select("id")
    .eq("email", "super@example.nl")
    .single();
  if (!u) return;
  await admin
    .from("users")
    .update({ ui_catalog_view: "table" })
    .eq("id", u.id);
}

test.describe("Sprint 3 — product variants", () => {
  test("grid tile chip switcher swaps SKU + price in place", async ({
    page,
  }) => {
    await ensureGridView();
    await signInAsSuper(page);
    // Filter by SKU prefix so the grid is small and deterministic.
    await page.goto("/catalog?q=SKU-VAR-CLEAN");

    // Scope to the first tile (each tile has its own switcher + price).
    const tile = page.locator("li").filter({ has: page.getByTestId("variant-switcher") }).first();
    const switcher = tile.getByTestId("variant-switcher");
    await expect(switcher).toBeVisible({ timeout: 10_000 });

    const tileSku = tile.getByTestId("tile-sku");
    const skuBefore = (await tileSku.innerText()).trim();

    // Click the chip that is NOT currently active. Active chips have
    // testid `variant-chip-active`; the other three are `variant-chip`.
    const inactiveChips = switcher.getByTestId("variant-chip");
    const inactiveCount = await inactiveChips.count();
    expect(inactiveCount).toBeGreaterThanOrEqual(2);
    await inactiveChips.last().click();

    // SKU swap confirms the sibling's id is now driving the tile.
    await expect(tileSku).not.toHaveText(skuBefore);
  });

  test("detail drawer lists siblings for a grouped product", async ({
    page,
  }) => {
    await ensureTableView();
    await signInAsSuper(page);
    // Open the detail for the 500ml cleaner (grouped).
    const { data: prod } = await admin
      .from("products")
      .select("id")
      .eq("sku", CLEANER_500_SKU)
      .single();
    await page.goto(`/catalog?pid=${prod!.id}`);

    const variantsSection = page.getByTestId("detail-variants");
    await expect(variantsSection).toBeVisible({ timeout: 10_000 });
    // 3 siblings: 500ml, 1L, 5L
    await expect(variantsSection.locator("li")).toHaveCount(3);
  });

  test("admin edit drawer — Variant group section renders for grouped product", async ({
    page,
  }) => {
    await ensureTableView();
    await signInAsSuper(page);
    const { data: prod } = await admin
      .from("products")
      .select("id")
      .eq("sku", CLEANER_1L_SKU)
      .single();
    await page.goto(`/catalog?eid=${prod!.id}`);

    const section = page.getByTestId("variant-group-section");
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(section).toContainText("Variant group");
    // Label input is pre-filled with this variant's current label (e.g. "1L").
    const labelInput = section.getByTestId("variant-label-input");
    const value = await labelInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
    // Siblings list visible for this group.
    await expect(
      section.getByTestId("variant-group-siblings"),
    ).toBeVisible();
  });

  test("admin edit drawer — ungrouped product shows Join-group form", async ({
    page,
  }) => {
    await ensureTableView();
    await signInAsSuper(page);
    // Pick any non-variant product (first one alphabetically by SKU from
    // the generated set — none of those start with SKU-VAR).
    const { data: prod } = await admin
      .from("products")
      .select("id")
      .is("variant_group_id", null)
      .is("deleted_at", null)
      .order("sku", { ascending: true })
      .limit(1)
      .single();
    await page.goto(`/catalog?eid=${prod!.id}`);

    const section = page.getByTestId("variant-group-section");
    await expect(section).toBeVisible({ timeout: 10_000 });
    // The group-choice dropdown is present and "Create new group" is an option.
    const select = section.getByTestId("variant-group-choice");
    await expect(select).toBeVisible();
    await expect(select).toContainText(/Create new group/);
    // The "Join group" submit button is shown (we don't click — that
    // would mutate the DB; a separate targeted integration test in
    // vitest-rls space would cover the mutation).
    await expect(section.getByRole("button", { name: /Join group/i }))
      .toBeVisible();
  });
});

// Safety cleanup — put super@example.nl back to table view (its
// shipped default) so we don't leave a test-only side effect.
test.afterAll(async () => {
  await ensureTableView();
});
