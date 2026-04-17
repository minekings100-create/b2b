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

function unique() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    .in("entity_id", ids)
    .in("entity_type", ["product", "inventory"]);
  await admin
    .from("inventory_movements")
    .delete()
    .in("product_id", ids)
    .eq("reference_type", "manual_adjustment");
  await admin.from("products").delete().in("id", ids);
});

test.describe("Phase 2.3 inventory + barcodes", () => {
  test("super admin adjusts inventory and manages barcodes on a product", async ({
    page,
  }) => {
    const sku = `E2E-${unique()}`.toUpperCase();
    await signInAsSuper(page);

    // Create a fresh product so the test is self-contained.
    await page.goto("/catalog?new=1");
    await page.getByLabel("SKU", { exact: true }).fill(sku);
    await page.getByLabel("Name", { exact: true }).fill("Inventory test SKU");
    await page.getByLabel(/Unit price/).fill("9.95");
    await page.getByLabel("Min order qty", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Create" }).click();

    // After create we're on /catalog?pid=<id>; open the edit drawer.
    await page.waitForURL(/pid=/);
    const created = await admin
      .from("products")
      .select("id")
      .eq("sku", sku)
      .single();
    const productId = created.data!.id;

    await page.getByRole("dialog").getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/eid=/);
    const drawer = page.getByRole("dialog");

    // --- Add stock (+25) -----------------------------------------------
    await drawer.getByLabel("Direction", { exact: true }).selectOption("in");
    await drawer.getByLabel("Amount", { exact: true }).fill("25");
    await drawer
      .getByLabel("Note", { exact: true })
      .fill("Initial cycle count");
    await drawer.getByRole("button", { name: "Adjust" }).click();

    await expect(drawer.getByText("Adjusted")).toBeVisible();

    const inv1 = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .single();
    expect(inv1.data?.quantity_on_hand).toBe(25);

    const mov1 = await admin
      .from("inventory_movements")
      .select("delta, reason, reference_type")
      .eq("product_id", productId)
      .eq("reference_type", "manual_adjustment")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(mov1.data?.delta).toBe(25);
    expect(mov1.data?.reason).toBe("adjustment_in");

    // --- Remove stock that would go negative should fail ---------------
    await drawer.getByLabel("Direction", { exact: true }).selectOption("out");
    await drawer.getByLabel("Amount", { exact: true }).fill("100");
    await drawer.getByRole("button", { name: "Adjust" }).click();
    await expect(drawer.getByText(/Not enough stock/i)).toBeVisible();

    const invStill = await admin
      .from("inventory")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .single();
    expect(invStill.data?.quantity_on_hand).toBe(25);

    // --- Save reorder level + location meta ---------------------------
    await drawer.getByLabel("Reorder level", { exact: true }).fill("10");
    await drawer.getByLabel("Bin location", { exact: true }).fill("Z-99");
    await drawer.getByRole("button", { name: "Update" }).click();

    await page.waitForTimeout(500);
    const invMeta = await admin
      .from("inventory")
      .select("reorder_level, warehouse_location")
      .eq("product_id", productId)
      .single();
    expect(invMeta.data?.reorder_level).toBe(10);
    expect(invMeta.data?.warehouse_location).toBe("Z-99");

    // --- Add a barcode -----------------------------------------------
    const code = `E2E-BC-${Date.now()}`;
    await drawer.getByLabel("Barcode", { exact: true }).fill(code);
    await drawer.getByLabel("Per unit", { exact: true }).fill("12");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(drawer.getByText("Added")).toBeVisible();

    const bc = await admin
      .from("product_barcodes")
      .select("id, unit_multiplier, deleted_at")
      .eq("product_id", productId)
      .eq("barcode", code)
      .single();
    expect(bc.data?.unit_multiplier).toBe(12);
    expect(bc.data?.deleted_at).toBeNull();

    // --- Remove that barcode -----------------------------------------
    await drawer
      .getByRole("button", { name: "Remove barcode" })
      .first()
      .click();

    await page.waitForTimeout(500);
    const bcGone = await admin
      .from("product_barcodes")
      .select("deleted_at")
      .eq("id", bc.data!.id)
      .single();
    expect(bcGone.data?.deleted_at).not.toBeNull();
  });

  test("branch user cannot access inventory adjust form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill("ams.user1@example.nl");
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Pick a seeded product id to try the direct URL.
    const { data: seeded } = await admin
      .from("products")
      .select("id")
      .not("sku", "like", "E2E-%")
      .limit(1)
      .single();
    await page.goto(`/catalog?eid=${seeded!.id}`);

    // No admin form drawer should render (server-side gate skips it).
    await expect(page.getByLabel("Direction", { exact: true })).toHaveCount(0);
    await expect(
      page.getByLabel("Barcode", { exact: true }),
    ).toHaveCount(0);
  });
});
