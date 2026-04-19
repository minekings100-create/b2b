import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 6 — Mollie (mock) + RMA end-to-end.
 *
 * Walks two flows:
 *   1. Branch user pays an issued invoice via the mock Mollie
 *      checkout → webhook flips status to paid + records a payment.
 *   2. Branch user requests a return → admin approves → admin
 *      receives with a replace resolution + restock flag → inventory
 *      bumps, a replacement order is created, status transitions to
 *      received → admin closes the return.
 *
 * Role gates: branch user can't see admin action surface on returns;
 * refund / credit_note resolution options are disabled in the UI.
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

// --- helpers ---------------------------------------------------------------

async function seedIssuedInvoice(): Promise<{
  invoice_id: string;
  invoice_number: string;
  order_id: string;
  branch_id: string;
}> {
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", "AMS")
    .single();
  const author = await userId("ams.user1@example.nl");
  const { data: product } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .eq("active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  const now = new Date().toISOString();
  const orderNumber = `ORD-PAY-${Date.now()}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branch!.id,
      created_by_user_id: author,
      status: "packed",
      submitted_at: now,
      branch_approved_at: now,
      approved_at: now,
    })
    .select("id")
    .single();

  const qty = 2;
  const unit = product!.unit_price_cents;
  const lineNet = qty * unit;
  const vat = Math.round((lineNet * product!.vat_rate) / 100);
  await admin.from("order_items").insert({
    order_id: order!.id,
    product_id: product!.id,
    quantity_requested: qty,
    quantity_approved: qty,
    quantity_packed: qty,
    unit_price_cents_snapshot: unit,
    vat_rate_snapshot: product!.vat_rate,
    line_net_cents: lineNet,
  });
  await admin
    .from("orders")
    .update({
      total_net_cents: lineNet,
      total_vat_cents: vat,
      total_gross_cents: lineNet + vat,
    })
    .eq("id", order!.id);

  // Allocate invoice number and create issued invoice directly.
  const year = new Date().getUTCFullYear();
  const { data: seq } = await admin.rpc("allocate_sequence", {
    p_key: `invoices_${year}`,
  });
  const invoiceNumber = `INV-${year}-${String(seq ?? 1).padStart(5, "0")}`;
  const due = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      order_id: order!.id,
      branch_id: branch!.id,
      status: "issued",
      issued_at: now,
      due_at: due,
      total_net_cents: lineNet,
      total_vat_cents: vat,
      total_gross_cents: lineNet + vat,
    })
    .select("id")
    .single();
  await admin.from("invoice_items").insert({
    invoice_id: invoice!.id,
    description: "Seed line",
    quantity: qty,
    unit_price_cents: unit,
    vat_rate: product!.vat_rate,
    line_net_cents: lineNet,
    line_vat_cents: vat,
  });

  return {
    invoice_id: invoice!.id,
    invoice_number: invoiceNumber,
    order_id: order!.id,
    branch_id: branch!.id,
  };
}

async function teardownInvoice(invoiceId: string, orderId: string) {
  await admin.from("payments").delete().eq("invoice_id", invoiceId);
  await admin.from("invoice_items").delete().eq("invoice_id", invoiceId);
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_id", invoiceId)
    .eq("entity_type", "invoice");
  await admin.from("invoices").delete().eq("id", invoiceId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("audit_log").delete().eq("entity_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

async function seedDeliveredOrder(): Promise<{
  order_id: string;
  order_number: string;
  branch_id: string;
  order_item_id: string;
  product_id: string;
  qty_approved: number;
  starting_on_hand: number;
}> {
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", "AMS")
    .single();
  const author = await userId("ams.user1@example.nl");
  const { data: product } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .eq("active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  const { data: inv } = await admin
    .from("inventory")
    .select("quantity_on_hand")
    .eq("product_id", product!.id)
    .single();
  const startingOnHand = inv?.quantity_on_hand ?? 0;

  const now = new Date().toISOString();
  const orderNumber = `ORD-RMA-${Date.now()}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branch!.id,
      created_by_user_id: author,
      status: "delivered",
      submitted_at: now,
      branch_approved_at: now,
      approved_at: now,
    })
    .select("id")
    .single();

  const qty = 3;
  const { data: item } = await admin
    .from("order_items")
    .insert({
      order_id: order!.id,
      product_id: product!.id,
      quantity_requested: qty,
      quantity_approved: qty,
      quantity_packed: qty,
      quantity_shipped: qty,
      unit_price_cents_snapshot: product!.unit_price_cents,
      vat_rate_snapshot: product!.vat_rate,
      line_net_cents: qty * product!.unit_price_cents,
    })
    .select("id")
    .single();

  return {
    order_id: order!.id,
    order_number: orderNumber,
    branch_id: branch!.id,
    order_item_id: item!.id,
    product_id: product!.id,
    qty_approved: qty,
    starting_on_hand: startingOnHand,
  };
}

async function teardownReturnFlow(
  orderId: string,
  productId: string,
  originalOnHand: number,
) {
  // Any returns + children
  const { data: returns } = await admin
    .from("returns")
    .select("id")
    .eq("order_id", orderId);
  const returnIds = (returns ?? []).map((r) => r.id);
  if (returnIds.length) {
    await admin
      .from("audit_log")
      .delete()
      .in("entity_id", returnIds)
      .eq("entity_type", "return");
    await admin.from("return_items").delete().in("return_id", returnIds);
    await admin
      .from("inventory_movements")
      .delete()
      .in("reference_id", returnIds)
      .eq("reference_type", "return");
    await admin.from("returns").delete().in("id", returnIds);
  }
  // Replacement orders from this flow
  const { data: repl } = await admin
    .from("orders")
    .select("id")
    .like("notes", `Replacement for RMA-%`);
  const replIds = (repl ?? []).map((o) => o.id);
  if (replIds.length) {
    await admin.from("order_items").delete().in("order_id", replIds);
    await admin.from("audit_log").delete().in("entity_id", replIds);
    await admin.from("orders").delete().in("id", replIds);
  }
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("audit_log").delete().eq("entity_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
  await admin
    .from("inventory")
    .update({ quantity_on_hand: originalOnHand })
    .eq("product_id", productId);
}

// --- tests ----------------------------------------------------------------

test.describe("Phase 6 — Mollie (mock) pay flow", () => {
  test("branch user pays an issued invoice, webhook flips to paid + records payment", async ({
    page,
  }) => {
    const seed = await seedIssuedInvoice();
    try {
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/invoices/${seed.invoice_id}`);
      await expect(page.getByTestId("pay-invoice-button")).toBeVisible();
      await page.getByTestId("pay-invoice-button").click();
      await page.waitForURL(/\/mollie-mock\/checkout/);
      await expect(page.getByTestId("mock-pay-button")).toBeVisible();
      await page.getByTestId("mock-pay-button").click();

      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("invoices")
              .select("status")
              .eq("id", seed.invoice_id)
              .single();
            return data?.status ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe("paid");

      const { data: payments } = await admin
        .from("payments")
        .select("method, reference, amount_cents")
        .eq("invoice_id", seed.invoice_id);
      expect(payments).toHaveLength(1);
      expect(payments![0]!.method).toBe("ideal_mollie");
      expect(payments![0]!.reference).toMatch(/^tr_mock_/);
    } finally {
      await teardownInvoice(seed.invoice_id, seed.order_id);
    }
  });

  test("failed webhook leaves the invoice in its current state", async ({
    page,
  }) => {
    const seed = await seedIssuedInvoice();
    try {
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/invoices/${seed.invoice_id}`);
      await page.getByTestId("pay-invoice-button").click();
      await page.waitForURL(/\/mollie-mock\/checkout/);
      await page.getByTestId("mock-fail-button").click();
      // No status flip. Poll for a few seconds to confirm stability.
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await admin
        .from("invoices")
        .select("status")
        .eq("id", seed.invoice_id)
        .single();
      expect(data!.status).toBe("issued");
    } finally {
      await teardownInvoice(seed.invoice_id, seed.order_id);
    }
  });
});

test.describe("Phase 6 — RMA state machine", () => {
  test("branch requests → admin approves → admin receives (replace + restock) → close", async ({
    page,
  }) => {
    const seed = await seedDeliveredOrder();
    try {
      // Branch creates return.
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/orders/${seed.order_id}`);
      await expect(
        page.getByTestId("order-create-return-button"),
      ).toBeVisible();
      await page.getByTestId("order-create-return-button").click();
      await page.waitForURL(/\/returns\/new\?order_id=/);

      const { data: product } = await admin
        .from("products")
        .select("sku")
        .eq("id", seed.product_id)
        .single();
      await page
        .getByTestId(`return-qty-${product!.sku}`)
        .fill("2");
      await page
        .getByTestId(`return-cond-${product!.sku}`)
        .selectOption("damaged");
      await Promise.all([
        page.waitForURL(/\/returns\/[0-9a-f-]+/),
        page.getByTestId("return-create-submit").click(),
      ]);

      // Pull the new return id from the URL.
      const url = new URL(page.url());
      const returnId = url.pathname.split("/").pop()!;

      // DB: status=requested, 1 return_item qty=2.
      const { data: created } = await admin
        .from("returns")
        .select("status, rma_number")
        .eq("id", returnId)
        .single();
      expect(created!.status).toBe("requested");
      expect(created!.rma_number).toMatch(/^RMA-\d{4}-\d{5}$/);

      // Branch user doesn't see admin controls.
      await expect(page.getByTestId("return-approve-button")).toHaveCount(0);

      // Admin approves.
      await signIn(page, "super@example.nl");
      await page.goto(`/returns/${returnId}`);
      await page.getByTestId("return-approve-button").click();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("returns")
              .select("status")
              .eq("id", returnId)
              .single();
            return data?.status ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe("approved");

      // Admin receives with replace + restock.
      await page.reload();
      await expect(page.getByTestId("return-receive-form")).toBeVisible();
      // Pull the return_item id from the rendered receive form rather
      // than re-querying the DB — guards against any tail-of-write
      // race where the row isn't visible to the next admin read yet.
      const riId = await page
        .getByTestId(/^receive-resolution-/)
        .first()
        .getAttribute("data-testid");
      const itemId = riId!.replace(/^receive-resolution-/, "");
      await page
        .getByTestId(`receive-resolution-${itemId}`)
        .selectOption("replace");
      await page.getByTestId(`receive-restock-${itemId}`).check();
      // Snapshot the on-hand value RIGHT BEFORE submit so the
      // post-assertion is robust against any other test having moved
      // inventory between this test's seed and now (cross-spec
      // serial runs can touch the same product).
      const { data: invBefore } = await admin
        .from("inventory")
        .select("quantity_on_hand")
        .eq("product_id", seed.product_id)
        .single();
      const onHandBeforeReceive = invBefore!.quantity_on_hand;
      await page.getByTestId("return-receive-submit").click();

      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("returns")
              .select("status")
              .eq("id", returnId)
              .single();
            return data?.status ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe("received");

      // Inventory bumped — assert against the snapshot taken right
      // before submit, not the seed-time read.
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("inventory")
              .select("quantity_on_hand")
              .eq("product_id", seed.product_id)
              .single();
            return data?.quantity_on_hand ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe(onHandBeforeReceive + 2);

      // Replacement order created at status='approved' with qty=2 on
      // the same product. The header insert and the order_items insert
      // happen in sequence after the return's status flip, so poll
      // until the items appear (rather than racing the post-status
      // tail of the action).
      await expect
        .poll(
          async () => {
            const { data: repl } = await admin
              .from("orders")
              .select("id")
              .eq("branch_id", seed.branch_id)
              .like("notes", `Replacement for ${created!.rma_number}`)
              .maybeSingle();
            if (!repl) return 0;
            const { data: items } = await admin
              .from("order_items")
              .select("id")
              .eq("order_id", repl.id);
            return items?.length ?? 0;
          },
          { timeout: 10_000 },
        )
        .toBe(1);
      const { data: repl } = await admin
        .from("orders")
        .select("id, status, notes")
        .eq("branch_id", seed.branch_id)
        .like("notes", `Replacement for ${created!.rma_number}`)
        .single();
      expect(repl.status).toBe("approved");
      const { data: replItems } = await admin
        .from("order_items")
        .select("product_id, quantity_approved")
        .eq("order_id", repl.id);
      expect(replItems).toHaveLength(1);
      expect(replItems![0]!.product_id).toBe(seed.product_id);
      expect(replItems![0]!.quantity_approved).toBe(2);

      // Close.
      await page.reload();
      await page.getByTestId("return-close-button").click();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("returns")
              .select("status")
              .eq("id", returnId)
              .single();
            return data?.status ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe("closed");
    } finally {
      await teardownReturnFlow(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
      );
    }
  });

  test("admin rejects a return with a reason; branch user sees it", async ({
    page,
  }) => {
    const seed = await seedDeliveredOrder();
    try {
      // Seed a requested return via admin client (cheaper than clicking through).
      const { data: seq } = await admin.rpc("allocate_sequence", {
        p_key: `rma_${new Date().getUTCFullYear()}`,
      });
      const rmaNumber = `RMA-${new Date().getUTCFullYear()}-${String(seq ?? 1).padStart(5, "0")}`;
      const { data: ret } = await admin
        .from("returns")
        .insert({
          rma_number: rmaNumber,
          order_id: seed.order_id,
          branch_id: seed.branch_id,
          requested_by_user_id: await userId("ams.user1@example.nl"),
          status: "requested",
        })
        .select("id")
        .single();
      await admin.from("return_items").insert({
        return_id: ret!.id,
        order_item_id: seed.order_item_id,
        quantity: 1,
        condition: "damaged",
      });

      await signIn(page, "super@example.nl");
      await page.goto(`/returns/${ret!.id}`);
      await page.getByTestId("return-reject-toggle").click();
      await page
        .getByTestId("return-reject-reason")
        .fill("Item is not eligible for return per our policy.");
      await page.getByTestId("return-reject-submit").click();

      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("returns")
              .select("status, notes")
              .eq("id", ret!.id)
              .single();
            return data?.status ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe("rejected");

      // Branch sees the reason on the detail page.
      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/returns/${ret!.id}`);
      await expect(
        page.getByText(/not eligible for return per our policy/i),
      ).toBeVisible();
    } finally {
      await teardownReturnFlow(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
      );
    }
  });

  test("refund and credit_note options are disabled in the receive form", async ({
    page,
  }) => {
    const seed = await seedDeliveredOrder();
    try {
      // Build a requested + approved return directly in DB.
      const { data: seq } = await admin.rpc("allocate_sequence", {
        p_key: `rma_${new Date().getUTCFullYear()}`,
      });
      const rmaNumber = `RMA-${new Date().getUTCFullYear()}-${String(seq ?? 1).padStart(5, "0")}`;
      const { data: ret } = await admin
        .from("returns")
        .insert({
          rma_number: rmaNumber,
          order_id: seed.order_id,
          branch_id: seed.branch_id,
          requested_by_user_id: await userId("ams.user1@example.nl"),
          status: "approved",
        })
        .select("id")
        .single();
      const { data: item } = await admin
        .from("return_items")
        .insert({
          return_id: ret!.id,
          order_item_id: seed.order_item_id,
          quantity: 1,
          condition: "damaged",
        })
        .select("id")
        .single();

      await signIn(page, "super@example.nl");
      await page.goto(`/returns/${ret!.id}`);
      const sel = page.getByTestId(`receive-resolution-${item!.id}`);
      await expect(sel).toBeVisible();
      // Disabled options carry the follow-up label.
      await expect(sel.locator("option[value='refund']")).toBeDisabled();
      await expect(sel.locator("option[value='credit_note']")).toBeDisabled();
      await expect(sel.locator("option[value='replace']")).toBeEnabled();
    } finally {
      await teardownReturnFlow(
        seed.order_id,
        seed.product_id,
        seed.starting_on_hand,
      );
    }
  });
});
