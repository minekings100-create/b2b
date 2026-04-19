import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 5 — invoice lifecycle e2e.
 *
 * Walks the admin happy path: create draft from a packed order →
 * issue → mark paid. Asserts DB state at each step + that the
 * branch user can see the (read-only) invoice but can't perform
 * admin actions.
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
  branch_id: string;
};

/**
 * Seeds a `packed` order owned by ams.user1 with a single line so the
 * invoice has something non-trivial to render.
 */
async function seedPackedOrder(): Promise<SeedResult> {
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

  const orderNumber = `ORD-INV-${Date.now()}`;
  const now = new Date().toISOString();
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

  const qty = 4;
  const lineNet = qty * product!.unit_price_cents;
  await admin.from("order_items").insert({
    order_id: order!.id,
    product_id: product!.id,
    quantity_requested: qty,
    quantity_approved: qty,
    quantity_packed: qty,
    unit_price_cents_snapshot: product!.unit_price_cents,
    vat_rate_snapshot: product!.vat_rate,
    line_net_cents: lineNet,
  });

  await admin
    .from("orders")
    .update({
      total_net_cents: lineNet,
      total_vat_cents: Math.round((lineNet * product!.vat_rate) / 100),
      total_gross_cents:
        lineNet + Math.round((lineNet * product!.vat_rate) / 100),
    })
    .eq("id", order!.id);

  return {
    order_id: order!.id,
    order_number: orderNumber,
    branch_id: branch!.id,
  };
}

async function teardown(orderId: string) {
  // Find any invoices we made along the way to clean up.
  const { data: invs } = await admin
    .from("invoices")
    .select("id")
    .eq("order_id", orderId);
  const invIds = (invs ?? []).map((i) => i.id);
  if (invIds.length > 0) {
    await admin.from("payments").delete().in("invoice_id", invIds);
    await admin.from("invoice_items").delete().in("invoice_id", invIds);
    await admin.from("audit_log").delete().in("entity_id", invIds).eq("entity_type", "invoice");
    await admin.from("notifications").delete().filter("payload_json->>order_id", "eq", orderId);
    for (const id of invIds) {
      await admin.from("notifications").delete().filter("payload_json->>invoice_id", "eq", id);
    }
    await admin.from("invoices").delete().in("id", invIds);
  }
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("audit_log").delete().eq("entity_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

test.describe("Phase 5 — invoice lifecycle", () => {
  test("admin draft → issue → mark paid", async ({ page }) => {
    const seed = await seedPackedOrder();
    try {
      await signIn(page, "super@example.nl");

      // Create draft from the order detail page.
      await page.goto(`/orders/${seed.order_id}`);
      await expect(page.getByTestId("create-invoice-button")).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/invoices\/[0-9a-f-]+/),
        page.getByTestId("create-invoice-button").click(),
      ]);

      // DB: draft created with the right shape.
      const { data: createdInv } = await admin
        .from("invoices")
        .select("id, invoice_number, status, total_gross_cents")
        .eq("order_id", seed.order_id)
        .single();
      expect(createdInv!.status).toBe("draft");
      expect(createdInv!.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);

      const { data: items } = await admin
        .from("invoice_items")
        .select("id, quantity, line_net_cents, line_vat_cents")
        .eq("invoice_id", createdInv!.id);
      expect(items).toHaveLength(1);
      expect(items![0]!.quantity).toBe(4);

      // PDF endpoint returns application/pdf.
      const pdfRes = await page.request.get(
        `/api/pdf/invoice/${createdInv!.id}`,
      );
      expect(pdfRes.status()).toBe(200);
      expect(pdfRes.headers()["content-type"]).toContain("application/pdf");

      // Issue.
      await page.getByTestId("invoice-issue-button").click();
      // Poll the DB directly: the page's revalidate + re-render is
      // async, and a pill text assertion races it. DB is authoritative.
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("invoices")
              .select("status")
              .eq("id", createdInv!.id)
              .single();
            return data?.status ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe("issued");
      const { data: issuedInv } = await admin
        .from("invoices")
        .select("status, issued_at, due_at")
        .eq("id", createdInv!.id)
        .single();
      expect(issuedInv!.status).toBe("issued");
      expect(issuedInv!.issued_at).not.toBeNull();
      expect(issuedInv!.due_at).not.toBeNull();
      // due_at = issued_at + 30 days (allow 1s skew).
      const issuedMs = new Date(issuedInv!.issued_at!).getTime();
      const dueMs = new Date(issuedInv!.due_at!).getTime();
      const diffDays = Math.round(
        (dueMs - issuedMs) / (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(30);

      // Mark paid. The status pill updates after revalidate — wait for
      // that before clicking mark-paid so we don't race the pending
      // issue submission. The pill is the primary status indicator.
      await expect(page.locator('[data-status="issued"]').first()).toBeVisible({
        timeout: 5_000,
      });
      await page
        .getByLabel("Method")
        .selectOption("manual_bank_transfer");
      await page.getByLabel("Reference (optional)").fill("BANK-TXN-12345");
      await page.getByTestId("invoice-markpaid-button").click();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("invoices")
              .select("status")
              .eq("id", createdInv!.id)
              .single();
            return data?.status ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe("paid");

      const { data: paidInv } = await admin
        .from("invoices")
        .select("status, paid_at, payment_method")
        .eq("id", createdInv!.id)
        .single();
      expect(paidInv!.status).toBe("paid");
      expect(paidInv!.payment_method).toBe("manual_bank_transfer");
      expect(paidInv!.paid_at).not.toBeNull();

      const { data: payments } = await admin
        .from("payments")
        .select("amount_cents, method, reference")
        .eq("invoice_id", createdInv!.id);
      expect(payments).toHaveLength(1);
      expect(payments![0]!.reference).toBe("BANK-TXN-12345");

      // Audit row sequence: draft_created, issued, paid.
      const { data: audit } = await admin
        .from("audit_log")
        .select("action")
        .eq("entity_type", "invoice")
        .eq("entity_id", createdInv!.id)
        .order("created_at", { ascending: true });
      const actions = (audit ?? []).map((a) => a.action);
      expect(actions).toEqual([
        "invoice_draft_created",
        "invoice_issued",
        "invoice_paid",
      ]);
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("branch user can read but not act on the invoice", async ({ page }) => {
    const seed = await seedPackedOrder();
    try {
      // Pre-create an issued invoice via admin client.
      const adminSession = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: numRpc } = await adminSession.rpc("allocate_sequence", {
        p_key: `invoices_${new Date().getUTCFullYear()}`,
      });
      const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${String(numRpc ?? 1).padStart(5, "0")}`;
      const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: inv } = await adminSession
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          order_id: seed.order_id,
          branch_id: seed.branch_id,
          status: "issued",
          issued_at: new Date().toISOString(),
          due_at: dueAt,
          total_net_cents: 100,
          total_vat_cents: 21,
          total_gross_cents: 121,
        })
        .select("id")
        .single();

      await signIn(page, "ams.user1@example.nl");
      await page.goto(`/invoices/${inv!.id}`);
      await expect(
        page.getByText(`Invoice ${invoiceNumber}`, { exact: false }),
      ).toBeVisible();

      // No admin action surface.
      await expect(page.getByTestId("invoice-issue-button")).toHaveCount(0);
      await expect(page.getByTestId("invoice-markpaid-button")).toHaveCount(0);
      await expect(page.getByTestId("invoice-cancel-button")).toHaveCount(0);
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("invoice list filter chips narrow by status", async ({ page }) => {
    const seed = await seedPackedOrder();
    try {
      // Seed two invoices: one paid + one draft (the same branch).
      const year = new Date().getUTCFullYear();
      const { data: n1 } = await admin.rpc("allocate_sequence", {
        p_key: `invoices_${year}`,
      });
      const { data: n2 } = await admin.rpc("allocate_sequence", {
        p_key: `invoices_${year}`,
      });
      const draftNumber = `INV-${year}-${String(n1 ?? 1).padStart(5, "0")}`;
      const paidNumber = `INV-${year}-${String(n2 ?? 1).padStart(5, "0")}`;
      const { data: draftInv } = await admin
        .from("invoices")
        .insert({
          invoice_number: draftNumber,
          order_id: seed.order_id,
          branch_id: seed.branch_id,
          status: "draft",
          total_net_cents: 100,
          total_vat_cents: 21,
          total_gross_cents: 121,
        })
        .select("id")
        .single();
      const { data: paidInv } = await admin
        .from("invoices")
        .insert({
          invoice_number: paidNumber,
          branch_id: seed.branch_id,
          status: "paid",
          issued_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
          due_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          paid_at: new Date().toISOString(),
          payment_method: "manual_bank_transfer",
          total_net_cents: 200,
          total_vat_cents: 42,
          total_gross_cents: 242,
        })
        .select("id")
        .single();

      try {
        await signIn(page, "super@example.nl");
        // Paid filter shows the paid invoice but not the draft.
        await page.goto("/invoices?status=paid");
        await expect(
          page.getByTestId(`invoice-row-${paidNumber}`),
        ).toBeVisible();
        await expect(
          page.getByTestId(`invoice-row-${draftNumber}`),
        ).toHaveCount(0);

        // Draft filter shows the draft.
        await page.goto("/invoices?status=draft");
        await expect(
          page.getByTestId(`invoice-row-${draftNumber}`),
        ).toBeVisible();
      } finally {
        await admin.from("invoices").delete().in("id", [draftInv!.id, paidInv!.id]);
      }
    } finally {
      await teardown(seed.order_id);
    }
  });

  test("admin cannot create a second invoice for an order that already has one", async ({
    page,
  }) => {
    const seed = await seedPackedOrder();
    try {
      // Create the first.
      await signIn(page, "super@example.nl");
      await page.goto(`/orders/${seed.order_id}`);
      await Promise.all([
        page.waitForURL(/\/invoices\/[0-9a-f-]+/),
        page.getByTestId("create-invoice-button").click(),
      ]);

      // Second visit shows the link, not the button.
      await page.goto(`/orders/${seed.order_id}`);
      await expect(page.getByTestId("order-invoice-link")).toBeVisible();
      await expect(page.getByTestId("create-invoice-button")).toHaveCount(0);
    } finally {
      await teardown(seed.order_id);
    }
  });
});
