import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signInAsSuper(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("super@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function signInAsBranchUser(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("ams.user1@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.afterAll(async () => {
  const { data: victims } = await admin
    .from("products")
    .select("id")
    .like("sku", "E2E-%");
  const ids = (victims ?? []).map((v) => v.id);
  if (ids.length === 0) return;
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "product")
    .in("entity_id", ids);
  await admin.from("products").delete().in("id", ids);
});

function uploadCsv(page: import("@playwright/test").Page, csv: string) {
  return page.locator('input[type="file"]').setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });
}

test.describe("Phase 2.4 CSV import", () => {
  test("super admin uploads a CSV, previews, and commits", async ({ page }) => {
    await signInAsSuper(page);
    await page.goto("/catalog/import");
    await expect(
      page.getByRole("heading", { name: "Import catalog" }),
    ).toBeVisible();

    const unique = Date.now();
    const newSku = `E2E-IMP-NEW-${unique}`;
    const badSku = `E2E-IMP-BAD-${unique}`;
    const dupSku = `E2E-IMP-DUP-${unique}`;
    const csv = [
      "sku,name,description,category_name,unit,unit_price_euro,vat_rate,min_order_qty,max_order_qty",
      `${newSku},Imported product,From CSV,Cleaning supplies,piece,4.95,21,1,`,
      `${dupSku},One,,Cleaning supplies,piece,1.00,21,1,`,
      `${dupSku},Duplicate,,Cleaning supplies,piece,1.00,21,1,`,
      `${badSku},No price,,Cleaning supplies,piece,,21,1,`,
    ].join("\n");

    await uploadCsv(page, csv);

    // Preview renders with counts + per-row statuses.
    //  row 1: newSku                  → new
    //  row 2: dupSku (first)          → new
    //  row 3: dupSku (second)         → error (duplicate in file)
    //  row 4: badSku (no price)       → error (Zod rejects)
    await expect(page.getByText("4 rows")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("2 new")).toBeVisible();
    await expect(page.getByText("2 error")).toBeVisible();
    await expect(page.getByText("Duplicate SKU in file")).toBeVisible();

    // Commit is disabled while any row has an error.
    const commit = page.getByRole("button", { name: "Commit import" });
    await expect(commit).toBeDisabled();

    // Re-upload a clean CSV — one new, one update on a seeded SKU.
    const { data: seeded } = await admin
      .from("products")
      .select("sku, name, unit_price_cents, vat_rate, min_order_qty")
      .not("sku", "like", "E2E-%")
      .limit(1)
      .single();
    const newName = `Imported product ${unique}`;
    const cleanCsv = [
      "sku,name,description,category_name,unit,unit_price_euro,vat_rate,min_order_qty,max_order_qty",
      `${newSku},${newName},From CSV,Cleaning supplies,piece,4.95,21,1,`,
      // Update an existing seeded SKU with a distinctive price so we can
      // assert the upsert landed.
      `${seeded!.sku},${seeded!.name} (imported),,Cleaning supplies,piece,99.99,${seeded!.vat_rate},${seeded!.min_order_qty},`,
    ].join("\n");

    await uploadCsv(page, cleanCsv);
    await expect(page.getByText("2 rows")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 new")).toBeVisible();
    await expect(page.getByText("1 update")).toBeVisible();
    await expect(commit).toBeEnabled();

    await commit.click();
    await expect(
      page.getByText("Imported — 1 new, 1 updated"),
    ).toBeVisible({ timeout: 15_000 });

    // DB reflects the import.
    const { data: inserted } = await admin
      .from("products")
      .select("sku, name, unit_price_cents")
      .eq("sku", newSku)
      .single();
    expect(inserted?.name).toBe(newName);
    expect(inserted?.unit_price_cents).toBe(495);

    const { data: updated } = await admin
      .from("products")
      .select("unit_price_cents")
      .eq("sku", seeded!.sku)
      .single();
    expect(updated?.unit_price_cents).toBe(9999);

    // Reset the seeded product so the test is idempotent.
    await admin
      .from("products")
      .update({
        name: seeded!.name,
        unit_price_cents: seeded!.unit_price_cents,
      })
      .eq("sku", seeded!.sku);

    // audit_log row for the new SKU.
    const insertedId = (
      await admin.from("products").select("id").eq("sku", newSku).single()
    ).data!.id;
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "product")
      .eq("entity_id", insertedId)
      .eq("action", "create");
    expect((audit ?? []).length).toBeGreaterThan(0);
  });

  test("branch user cannot access the import page", async ({ page }) => {
    await signInAsBranchUser(page);
    await page.goto("/catalog/import");
    await expect(page).toHaveURL(/\/catalog($|\?)/);
    await expect(
      page.getByRole("heading", { name: "Import catalog" }),
    ).toHaveCount(0);
  });
});
