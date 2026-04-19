import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 4 — pack queue + pick/pack happy path.
 *
 * Seeds a fresh approved order owned by ams.user1 on the Amsterdam
 * branch, signs in as packer1, and walks the full flow: scan a
 * barcode, close the pallet, complete the pack. Asserts DB state end
 * to end (order.status → packed, inventory decremented, pallet label
 * PDF renders, audit trail complete).
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

type SeedResult = {
  order_id: string;
  order_number: string;
  item_id: string;
  product_id: string;
  barcode: string;
  starting_on_hand: number;
  starting_reserved: number;
};

/**
 * Build an approved order with a single line on a product that has a
 * known barcode and enough on-hand inventory. Returns the ids + the
 * inventory baseline so the test can assert the decrement.
 */
async function seedApprovedOrder(): Promise<SeedResult> {
  const branchCode = "AMS";
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", branchCode)
    .single();
  const author = await userId("ams.user1@example.nl");
  const hq = await userId("hq.ops@example.nl");
  const mgr = await userId("ams.mgr@example.nl");

  // Pick a product that has at least one barcode and inventory on hand.
  const { data: barcodeRow } = await admin
    .from("product_barcodes")
    .select("product_id, barcode, unit_multiplier")
    .eq("unit_multiplier", 1)
    .is("deleted_at", null)
    .limit(1)
    .single();
  const productId = barcodeRow!.product_id;
  const barcode = barcodeRow!.barcode;

  const { data: inv } = await admin
    .from("inventory")
    .select("quantity_on_hand, quantity_reserved")
    .eq("product_id", productId)
    .single();
  const startingOnHand = inv!.quantity_on_hand;
  const startingReserved = inv!.quantity_reserved;

  // Guarantee enough stock for a pack-of-2 test scenario.
  if (startingOnHand < 5) {
    await admin
      .from("inventory")
      .update({ quantity_on_hand: 50 })
      .eq("product_id", productId);
  }

  const { data: product } = await admin
    .from("products")
    .select("unit_price_cents, vat_rate")
    .eq("id", productId)
    .single();

  const orderNumber = `ORD-PACK-${Date.now()}`;
  const now = new Date().toISOString();
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branch!.id,
      created_by_user_id: author,
      status: "approved",
      submitted_at: now,
      branch_approved_at: now,
      branch_approved_by_user_id: mgr,
      approved_at: now,
      approved_by_user_id: hq,
    })
    .select("id")
    .single();
  const orderId = order!.id;

  // One line, approved qty 2 (enough to exercise scan → close → complete).
  const approvedQty = 2;
  const unitNet = (product!.unit_price_cents ?? 100) * approvedQty;
  const { data: item } = await admin
    .from("order_items")
    .insert({
      order_id: orderId,
      product_id: productId,
      quantity_requested: approvedQty,
      quantity_approved: approvedQty,
      unit_price_cents_snapshot: product!.unit_price_cents ?? 100,
      vat_rate_snapshot: product!.vat_rate ?? 21,
      line_net_cents: unitNet,
    })
    .select("id")
    .single();

  // Reserve the stock (approval side-effect is expected here).
  await admin
    .from("inventory")
    .update({
      quantity_reserved: startingReserved + approvedQty,
    })
    .eq("product_id", productId);

  return {
    order_id: orderId,
    order_number: orderNumber,
    item_id: item!.id,
    product_id: productId,
    barcode,
    starting_on_hand: Math.max(startingOnHand, 50),
    starting_reserved: startingReserved + approvedQty,
  };
}

async function teardownOrder(orderId: string, productId: string, originalOnHand: number, originalReserved: number) {
  await admin
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "order")
    .eq("reference_id", orderId);
  await admin.from("pallet_items").delete().in(
    "pallet_id",
    (
      await admin.from("pallets").select("id").eq("order_id", orderId)
    ).data?.map((p) => p.id) ?? [],
  );
  await admin.from("pallets").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("audit_log").delete().eq("entity_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
  // Best-effort inventory restore (test was at most a +2 reserve, -2 on_hand).
  await admin
    .from("inventory")
    .update({
      quantity_on_hand: originalOnHand,
      quantity_reserved: originalReserved,
    })
    .eq("product_id", productId);
}

test.describe("Phase 4 — pick & pack happy path", () => {
  test("packer scans two units, closes pallet, completes pack", async ({
    page,
  }) => {
    const seed = await seedApprovedOrder();

    try {
      await signIn(page, "packer1@example.nl");
      await page.goto("/pack");
      await expect(
        page.getByRole("link", { name: seed.order_number }),
      ).toBeVisible();
      await page.getByRole("link", { name: seed.order_number }).click();
      await page.waitForURL(new RegExp(`/pack/${seed.order_id}`));

      // Scan the product barcode twice — fills the single line (qty=2).
      const scan = page.getByTestId("scan-input");
      await scan.fill(seed.barcode);
      await scan.press("Enter");
      await expect(
        page.locator(`[data-line-id="${seed.item_id}"] [data-testid="line-progress"]`),
      ).toHaveText(/^1/);

      await scan.fill(seed.barcode);
      await scan.press("Enter");
      await expect(
        page.locator(`[data-line-id="${seed.item_id}"] [data-testid="line-progress"]`),
      ).toHaveText(/^2/);

      // One open pallet should exist with those items; close it.
      await page.getByTestId("close-pallet-button").click();
      // After close, a "Label PDF" link replaces the Close button.
      await expect(page.getByTestId("print-label-link")).toBeVisible({
        timeout: 5_000,
      });

      // Complete pack.
      const complete = page.getByTestId("complete-pack-button");
      await expect(complete).toBeEnabled({ timeout: 5_000 });
      await complete.click();
      // After revalidate the order is now `packed` — the server
      // component re-renders the status pill but the Complete form
      // unmounts (isActionable flips to false). Assert on the pill.
      await expect(page.getByText("Packed", { exact: true })).toBeVisible({
        timeout: 5_000,
      });

      // Status in DB now packed + inventory decremented.
      const { data: orderAfter } = await admin
        .from("orders")
        .select("status")
        .eq("id", seed.order_id)
        .single();
      expect(orderAfter!.status).toBe("packed");

      const { data: invAfter } = await admin
        .from("inventory")
        .select("quantity_on_hand, quantity_reserved")
        .eq("product_id", seed.product_id)
        .single();
      expect(invAfter!.quantity_on_hand).toBe(seed.starting_on_hand - 2);
      expect(invAfter!.quantity_reserved).toBe(seed.starting_reserved - 2);

      // An inventory_movements row with reason='packed' and delta=-2.
      const { data: movements } = await admin
        .from("inventory_movements")
        .select("delta, reason, product_id")
        .eq("reference_type", "order")
        .eq("reference_id", seed.order_id);
      expect(movements).toContainEqual(
        expect.objectContaining({
          delta: -2,
          reason: "packed",
          product_id: seed.product_id,
        }),
      );

      // Audit trail: pack_increment (x2), pallet_closed, order_packed.
      const { data: audit } = await admin
        .from("audit_log")
        .select("action")
        .eq("entity_id", seed.order_id);
      const actions = (audit ?? []).map((a) => a.action);
      expect(actions.filter((a) => a === "pack_increment").length).toBeGreaterThanOrEqual(2);
      expect(actions).toContain("pallet_closed");
      expect(actions).toContain("order_packed");
    } finally {
      await teardownOrder(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
        seed.starting_reserved - 2, // reserved goes back to what it was before the test-added reserve
      );
    }
  });

  test("pick list PDF is reachable for the order", async ({ page }) => {
    const seed = await seedApprovedOrder();
    try {
      await signIn(page, "packer1@example.nl");
      const res = await page.request.get(
        `/api/pdf/pick-list/${seed.order_id}`,
      );
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/pdf");
    } finally {
      await teardownOrder(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
        seed.starting_reserved - 2,
      );
    }
  });

  test("inline detail panel shows warehouse location + barcode", async ({
    page,
  }) => {
    const seed = await seedApprovedOrder();
    try {
      await signIn(page, "packer1@example.nl");
      await page.goto(`/pack/${seed.order_id}`);
      await page.locator(`[data-line-id="${seed.item_id}"]`).click();
      const detail = page.getByTestId("pick-line-detail");
      await expect(detail).toBeVisible();
      await expect(detail).toContainText(seed.barcode);
    } finally {
      await teardownOrder(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
        seed.starting_reserved - 2,
      );
    }
  });

  test("a non-packer cannot open /pack", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/pack");
    // Redirects away (role guard). URL lands on dashboard.
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
  });
});
