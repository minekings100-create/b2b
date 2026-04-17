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

function unique() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

test.describe("Phase 2.2 admin product CRUD", () => {
  test("super admin can create, edit, and archive a product", async ({
    page,
  }) => {
    const sku = `E2E-${unique()}`.toUpperCase();
    await signInAsSuper(page);

    // --- Create -----------------------------------------------------------
    await page.goto("/catalog");
    await page.getByRole("link", { name: "New product" }).click();
    await expect(page).toHaveURL(/new=1/);

    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Name").fill("E2E test product");
    await page.getByLabel("Description").fill("Created by Playwright.");
    await page.getByLabel("Unit price").fill("12.50");
    await page.getByLabel("Min order qty").fill("1");
    await page.getByRole("button", { name: "Create" }).click();

    // After submit, we redirect to /catalog?pid=<id> — the detail drawer
    // opens on the new SKU.
    await page.waitForURL(/pid=/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(sku)).toBeVisible();

    const created = await admin
      .from("products")
      .select("id, unit_price_cents, vat_rate")
      .eq("sku", sku)
      .is("deleted_at", null)
      .single();
    expect(created.data?.unit_price_cents).toBe(1250);
    const productId = created.data!.id;

    // Audit log row exists for create.
    const createAudit = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "product")
      .eq("entity_id", productId)
      .eq("action", "create");
    expect((createAudit.data ?? []).length).toBeGreaterThan(0);

    // --- Edit ------------------------------------------------------------
    await dialog.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/eid=/);
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("Name").fill("E2E test product (updated)");
    await editDialog.getByRole("button", { name: "Save" }).click();

    await page.waitForURL(/pid=/);
    await expect(
      page.getByRole("dialog").getByText("E2E test product (updated)"),
    ).toBeVisible();

    const updated = await admin
      .from("products")
      .select("name")
      .eq("id", productId)
      .single();
    expect(updated.data?.name).toBe("E2E test product (updated)");

    // --- Archive ---------------------------------------------------------
    await page.getByRole("dialog").getByRole("link", { name: "Edit" }).click();
    const archiveDialog = page.getByRole("dialog");
    await archiveDialog.getByRole("button", { name: "Archive product" }).click();
    await archiveDialog.getByRole("button", { name: "Confirm archive" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).not.toHaveURL(/eid=/);
    const archived = await admin
      .from("products")
      .select("deleted_at, active")
      .eq("id", productId)
      .single();
    expect(archived.data?.deleted_at).not.toBeNull();
    expect(archived.data?.active).toBe(false);

    const archiveAudit = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "product")
      .eq("entity_id", productId)
      .eq("action", "archive");
    expect((archiveAudit.data ?? []).length).toBeGreaterThan(0);
  });

  test("branch user cannot see the New product button", async ({ page }) => {
    await signInAsBranchUser(page);
    await page.goto("/catalog");
    await expect(page.getByRole("link", { name: "New product" })).toHaveCount(0);
  });

  test("branch user direct URL ?new=1 does not render the form", async ({
    page,
  }) => {
    await signInAsBranchUser(page);
    await page.goto("/catalog?new=1");
    // No form drawer should appear. The SKU label is form-specific.
    await expect(page.getByLabel("SKU")).toHaveCount(0);
  });
});
