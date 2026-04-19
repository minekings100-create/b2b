import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 3.4 — order edit end-to-end.
 *
 * Seeds a submitted order owned by ams.user1 on the Amsterdam branch,
 * walks a creator edit → BM re-approval flow, and asserts DB state for
 * edit_count, history row, audit row, concurrency guards, and role
 * gating (HQ cannot edit).
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
  line_a_item_id: string;
  line_a_product_id: string;
  line_b_product_id: string;
  branch_id: string;
};

async function seedSubmittedOrder(): Promise<SeedResult> {
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", "AMS")
    .single();
  const author = await userId("ams.user1@example.nl");

  // Pick two distinct active products.
  const { data: products } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .eq("active", true)
    .is("deleted_at", null)
    .limit(2);
  const [pA, pB] = products!;

  const orderNumber = `ORD-EDIT-${Date.now()}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branch!.id,
      created_by_user_id: author,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // Only one starting line so we can exercise "add" and "remove" separately.
  const { data: itemA } = await admin
    .from("order_items")
    .insert({
      order_id: order!.id,
      product_id: pA!.id,
      quantity_requested: 3,
      unit_price_cents_snapshot: pA!.unit_price_cents,
      vat_rate_snapshot: pA!.vat_rate,
      line_net_cents: 3 * pA!.unit_price_cents,
    })
    .select("id")
    .single();

  // Recompute totals on the order so the detail page reads match.
  const net = 3 * pA!.unit_price_cents;
  const vat = Math.round((net * pA!.vat_rate) / 100);
  await admin
    .from("orders")
    .update({
      total_net_cents: net,
      total_vat_cents: vat,
      total_gross_cents: net + vat,
    })
    .eq("id", order!.id);

  return {
    order_id: order!.id,
    order_number: orderNumber,
    line_a_item_id: itemA!.id,
    line_a_product_id: pA!.id,
    line_b_product_id: pB!.id,
    branch_id: branch!.id,
  };
}

async function teardown(orderId: string) {
  await admin.from("order_edit_history").delete().eq("order_id", orderId);
  await admin.from("notifications").delete().filter("payload_json->>order_id", "eq", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("audit_log").delete().eq("entity_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

test.describe("Phase 3.4 — order edit", () => {
  test("creator edits a submitted order: qty change, add line, save", async ({
    page,
  }) => {
    const seed = await seedSubmittedOrder();
    try {
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/orders/${seed.order_id}`);

      // Edit button visible for the creator.
      await expect(page.getByTestId("order-edit-button")).toBeVisible();
      await page.getByTestId("order-edit-button").click();
      await page.waitForURL(new RegExp(`/orders/${seed.order_id}/edit`));

      // One line in the form initially. Bump its quantity.
      const lines = page.getByTestId("edit-line");
      await expect(lines).toHaveCount(1);

      // Grab the sku from the first line so we can target its qty input.
      const sku = (await lines.first().locator("td").first().textContent())?.trim();
      expect(sku).toBeTruthy();
      await page.getByTestId(`edit-qty-${sku}`).fill("5");

      // Search for a second product by sku prefix — the `pB` we seeded.
      const { data: pB } = await admin
        .from("products")
        .select("sku")
        .eq("id", seed.line_b_product_id)
        .single();
      await page.getByTestId("edit-add-search").fill(pB!.sku);
      await page.getByTestId(`edit-add-${pB!.sku}`).click({ timeout: 5_000 });
      await expect(page.getByTestId("edit-line")).toHaveCount(2);

      // Open + confirm.
      await page.getByTestId("edit-open-confirm").click();
      await expect(page.getByTestId("edit-confirm-modal")).toBeVisible();
      await page.getByTestId("edit-confirm-save").click();

      // Redirect lands on /orders/[id]?saved=1.
      await page.waitForURL(new RegExp(`/orders/${seed.order_id}(\\?|$)`), {
        timeout: 10_000,
      });

      // DB state: edit_count = 1, last_edited_at set, two order_items rows.
      const { data: post } = await admin
        .from("orders")
        .select("edit_count, last_edited_at, last_edited_by_user_id, submitted_at, total_gross_cents")
        .eq("id", seed.order_id)
        .single();
      expect(post!.edit_count).toBe(1);
      expect(post!.last_edited_at).not.toBeNull();
      expect(post!.last_edited_by_user_id).toBe(await userId("ams.user1@example.nl"));
      // submitted_at is reset to the edit time — matches last_edited_at.
      expect(post!.submitted_at).toBe(post!.last_edited_at);

      const { count: itemCount } = await admin
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", seed.order_id);
      expect(itemCount).toBe(2);

      // History row captured.
      const { data: history } = await admin
        .from("order_edit_history")
        .select("id, before_snapshot, after_snapshot")
        .eq("order_id", seed.order_id);
      expect(history).toHaveLength(1);
      const before = (history![0]!.before_snapshot as { items: unknown[] }).items;
      const after = (history![0]!.after_snapshot as { items: unknown[] }).items;
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(2);

      // Audit row.
      const { data: audit } = await admin
        .from("audit_log")
        .select("action")
        .eq("entity_id", seed.order_id)
        .eq("action", "order_edited");
      expect(audit).toHaveLength(1);

      // Edit history section rendered on the detail page.
      await expect(page.getByTestId("order-edit-history")).toBeVisible();
      await expect(page.getByText(/edit history \(1 edit\)/i)).toBeVisible();
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("HQ Manager cannot reach the edit page or see the Edit button", async ({
    page,
  }) => {
    const seed = await seedSubmittedOrder();
    try {
      await signIn(page, "hq.ops@example.nl");
      await page.goto(`/orders/${seed.order_id}`);
      await expect(page.getByTestId("order-edit-button")).toHaveCount(0);

      // Direct URL → bounced back to detail (no /edit suffix).
      await page.goto(`/orders/${seed.order_id}/edit`);
      await page.waitForURL((url) =>
        url.pathname === `/orders/${seed.order_id}`,
      );
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("BM approve with stale last_edited_at_expected is refused with a friendly error", async ({
    page,
  }) => {
    // Seed + edit once so the order has a non-null last_edited_at.
    const seed = await seedSubmittedOrder();
    try {
      // Apply an edit via admin to bump last_edited_at directly.
      const now = new Date().toISOString();
      await admin
        .from("orders")
        .update({
          edit_count: 1,
          last_edited_at: now,
          last_edited_by_user_id: await userId("ams.user1@example.nl"),
          submitted_at: now,
        })
        .eq("id", seed.order_id);

      // Sign in as BM and open the approve form — this renders with the
      // freshly-bumped last_edited_at. Then, sneakily, bump it again out
      // of band to simulate a second edit landing while the BM was reading.
      await signIn(page, "ams.mgr@example.nl");
      await page.goto(`/orders/${seed.order_id}`);

      // Out-of-band advance.
      await admin
        .from("orders")
        .update({
          edit_count: 2,
          last_edited_at: new Date(Date.now() + 1_000).toISOString(),
        })
        .eq("id", seed.order_id);

      // Submit the approve form — guard should trip with the edited-under-you message.
      await page.getByRole("button", { name: /branch-approve order/i }).click();
      // Error banner rendered via searchParams.error on the detail page.
      await expect(
        page.getByText(/was just edited|refresh to review/i),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("refuses to save with zero lines", async ({ page }) => {
    const seed = await seedSubmittedOrder();
    try {
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/orders/${seed.order_id}/edit`);
      // Remove the only line.
      const firstLine = page.getByTestId("edit-line").first();
      const sku = (await firstLine.locator("td").first().textContent())?.trim();
      expect(sku).toBeTruthy();
      await page.getByTestId(`edit-remove-${sku}`).click();
      await expect(page.getByTestId("edit-line")).toHaveCount(0);
      // Save button is disabled with no lines.
      await expect(page.getByTestId("edit-open-confirm")).toBeDisabled();
    } finally {
      await teardown(seed.order_id);
    }
  });
});
