import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function userId(email: string) {
  const { data } = await admin.from("users").select("id").eq("email", email).single();
  return data!.id;
}

/**
 * Create a submitted order for a given branch user + product ids, bypassing
 * the UI. Keeps the test fast and isolates the approval flow.
 */
async function makeSubmittedOrder(
  email: string,
  productIds: string[],
  qty = 2,
) {
  const uid = await userId(email);
  const { data: roles } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", uid)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  const branchId = roles!.branch_id!;

  const orderNumber = `ORD-E2E-${Date.now()}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branchId,
      created_by_user_id: uid,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // Fetch product snapshots.
  const { data: prods } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .in("id", productIds);
  const itemRows = (prods ?? []).map((p) => ({
    order_id: order!.id,
    product_id: p.id,
    quantity_requested: qty,
    unit_price_cents_snapshot: p.unit_price_cents,
    vat_rate_snapshot: p.vat_rate,
    line_net_cents: qty * p.unit_price_cents,
  }));
  await admin.from("order_items").insert(itemRows);

  // Recompute totals.
  const net = itemRows.reduce((a, r) => a + r.line_net_cents, 0);
  const vat = itemRows.reduce(
    (a, r, i) =>
      a + Math.round((r.line_net_cents * prods![i]!.vat_rate) / 100),
    0,
  );
  await admin
    .from("orders")
    .update({
      total_net_cents: net,
      total_vat_cents: vat,
      total_gross_cents: net + vat,
    })
    .eq("id", order!.id);

  return { orderId: order!.id, branchId, userId: uid, orderNumber };
}

async function cleanup(orderNumberPrefix = "ORD-E2E-") {
  const { data } = await admin
    .from("orders")
    .select("id, order_number")
    .like("order_number", `${orderNumberPrefix}%`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await admin
    .from("inventory_movements")
    .delete()
    .in("reference_id", ids)
    .in("reason", ["order_reserved", "order_released"]);
  await admin.from("audit_log").delete().eq("entity_type", "order").in("entity_id", ids);
  await admin.from("orders").delete().in("id", ids);
}

test.beforeEach(async () => {
  await cleanup();
});
test.afterAll(async () => {
  await cleanup();
});

test.describe("Phase 3.2 approval flow", () => {
  test("manager approves an order, inventory reservation lands + audit trail", async ({
    page,
  }) => {
    // Pick 2 seeded products.
    const { data: prods } = await admin
      .from("products")
      .select("id")
      .not("sku", "like", "E2E-%")
      .limit(2);
    const pids = (prods ?? []).map((p) => p.id);
    const { orderId, branchId, orderNumber } = await makeSubmittedOrder(
      "ams.user1@example.nl",
      pids,
      3,
    );

    await signIn(page, "ams.mgr@example.nl");
    await page.goto("/approvals");
    await expect(
      page.getByRole("link", { name: orderNumber }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("link", { name: orderNumber }).click();

    await page.waitForURL(new RegExp(`/orders/${orderId}`));
    await expect(
      page.getByRole("heading", { name: `Order ${orderNumber}` }),
    ).toBeVisible();

    // Cap first line to 2 (from 3).
    const firstQty = page.getByRole("spinbutton").first();
    await firstQty.fill("2");

    await page.getByRole("button", { name: "Approve order" }).click();
    // NOTE: `waitForURL` is NOT a reliable gate here — the server action's
    // redirect goes to the same `/orders/<id>` the page is already on, so
    // the regex matches instantly and Playwright resumes before the POST
    // round-trip finishes. Poll the DB instead until the action's commit
    // is observable.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("orders")
            .select("status")
            .eq("id", orderId)
            .single();
          return data?.status ?? null;
        },
        { timeout: 5_000 },
      )
      .toBe("approved");

    const { data: after } = await admin
      .from("orders")
      .select("status, approved_at, approved_by_user_id")
      .eq("id", orderId)
      .single();
    expect(after?.status).toBe("approved");
    expect(after?.approved_at).not.toBeNull();

    // First line carries the capped approved qty.
    const { data: items } = await admin
      .from("order_items")
      .select("product_id, quantity_approved")
      .eq("order_id", orderId)
      .order("product_id");
    const qtys = (items ?? []).map((i) => i.quantity_approved);
    expect(qtys.sort()).toEqual([2, 3]);

    // Reservation movements present.
    const { data: movements } = await admin
      .from("inventory_movements")
      .select("reason, delta")
      .eq("reference_id", orderId)
      .eq("reason", "order_reserved");
    expect((movements ?? []).length).toBe(2);
    const totalDelta = (movements ?? []).reduce((a, m) => a + m.delta, 0);
    expect(totalDelta).toBe(-5); // 2 + 3 reserved = -5 delta total

    // inventory.quantity_reserved bumped on both products.
    const { data: invs } = await admin
      .from("inventory")
      .select("product_id, quantity_reserved")
      .in("product_id", pids);
    const reservedSum = (invs ?? []).reduce(
      (a, r) => a + r.quantity_reserved,
      0,
    );
    expect(reservedSum).toBeGreaterThanOrEqual(5);

    // Audit trail has approve entry.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, after_json")
      .eq("entity_type", "order")
      .eq("entity_id", orderId)
      .eq("action", "approve")
      .single();
    expect(audit?.action).toBe("approve");
    const payload = audit?.after_json as
      | { status?: string; approved_lines?: unknown[] }
      | null;
    expect(payload?.status).toBe("approved");
    expect(Array.isArray(payload?.approved_lines)).toBe(true);
    expect(payload!.approved_lines!.length).toBe(2);

    void branchId;
  });

  test("manager rejects with a required reason", async ({ page }) => {
    const { data: prods } = await admin
      .from("products")
      .select("id")
      .not("sku", "like", "E2E-%")
      .limit(1);
    const { orderId, orderNumber } = await makeSubmittedOrder(
      "ams.user1@example.nl",
      (prods ?? []).map((p) => p.id),
      1,
    );

    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);

    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByLabel("Rejection reason")
      .fill("Over monthly budget — please resubmit next month.");
    await page.getByRole("button", { name: "Confirm reject" }).click();

    // Same stale-URL-match hazard as the approve test — poll until the
    // commit is observable rather than relying on waitForURL.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("orders")
            .select("status")
            .eq("id", orderId)
            .single();
          return data?.status ?? null;
        },
        { timeout: 5_000 },
      )
      .toBe("rejected");

    const { data: after } = await admin
      .from("orders")
      .select("status, rejection_reason")
      .eq("id", orderId)
      .single();
    expect(after?.rejection_reason).toMatch(/budget/i);

    void orderNumber;
  });

  test("cancel an approved order releases reservations", async ({ page }) => {
    const { data: prods } = await admin
      .from("products")
      .select("id")
      .not("sku", "like", "E2E-%")
      .limit(1);
    const pids = (prods ?? []).map((p) => p.id);
    const { orderId } = await makeSubmittedOrder(
      "ams.user1@example.nl",
      pids,
      4,
    );

    // Approve first via the UI. Poll the DB until the commit is observable
    // (see the approve test's note about waitForURL on same-path redirects).
    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Approve order" }).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("orders")
            .select("status")
            .eq("id", orderId)
            .single();
          return data?.status ?? null;
        },
        { timeout: 5_000 },
      )
      .toBe("approved");

    // Capture reservation snapshot before cancel.
    const { data: before } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", pids[0]!)
      .single();
    const reservedBefore = before!.quantity_reserved;

    // Reload so the page re-renders with status=approved and the CancelForm
    // is mounted (the server-redirect to the same path doesn't re-render
    // the RSC tree client-side reliably under Playwright's navigation
    // semantics).
    await page.reload();

    // Cancel.
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("orders")
            .select("status")
            .eq("id", orderId)
            .single();
          return data?.status ?? null;
        },
        { timeout: 5_000 },
      )
      .toBe("cancelled");

    const { data: orderAfter } = await admin
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    expect(orderAfter?.status).toBe("cancelled");

    // Reservation released.
    const { data: after } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", pids[0]!)
      .single();
    expect(after!.quantity_reserved).toBeLessThanOrEqual(reservedBefore - 4);

    // Release movement appended.
    const { data: rel } = await admin
      .from("inventory_movements")
      .select("reason")
      .eq("reference_id", orderId)
      .eq("reason", "order_released");
    expect((rel ?? []).length).toBeGreaterThan(0);
  });

  test("branch user cannot access /approvals", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/dashboard(\?|$)/);
  });
});
