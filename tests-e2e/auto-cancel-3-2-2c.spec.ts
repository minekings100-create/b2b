import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.2.2c — auto-cancel stale orders.
 *
 * Each test seeds a fixture order with a deliberately ancient timestamp
 * (well beyond the SLA), drives the cron route, and asserts the
 * downstream effects: status flip, audit reason, reservation release.
 *
 * Pinning timestamps to a far-back instant (10 calendar days ago) keeps
 * the assertions robust against DST shifts and the working-day arithmetic
 * — anything older than 7 calendar days is guaranteed to be older than
 * 2 *or* 3 working days too.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ORDER_PREFIX = "ORD-E2E-322C-";
const ANCIENT_DAYS = 10;
const ancientIso = () =>
  new Date(Date.now() - ANCIENT_DAYS * 24 * 3600_000).toISOString();
const recentIso = () => new Date().toISOString();

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function branchIdForUser(uid: string): Promise<string> {
  const { data } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", uid)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  return data!.branch_id!;
}

async function makeOrder(opts: {
  status: "submitted" | "branch_approved";
  ancient: boolean;
  qtyPerLine?: number;
  productLimit?: number;
}): Promise<{ id: string; orderNumber: string; productIds: string[] }> {
  const author = await userId("ams.user1@example.nl");
  const branchId = await branchIdForUser(author);
  const mgr = await userId("ams.mgr@example.nl");
  const orderNumber = `${ORDER_PREFIX}${opts.status}-${Date.now()}-${Math.floor(
    Math.random() * 9999,
  )}`;
  const insert: Record<string, unknown> = {
    order_number: orderNumber,
    branch_id: branchId,
    created_by_user_id: author,
    status: opts.status,
    submitted_at: opts.ancient ? ancientIso() : recentIso(),
  };
  if (opts.status === "branch_approved") {
    insert.branch_approved_at = opts.ancient ? ancientIso() : recentIso();
    insert.branch_approved_by_user_id = mgr;
  }
  const { data: order } = await admin
    .from("orders")
    .insert(insert)
    .select("id")
    .single();
  const orderId = order!.id;

  // Add line items so the step-2 release path has real reservations to
  // reverse. Reservations are made by inserting `inventory_movements`
  // rows directly (we're bypassing the BM-approve action here for
  // fixture speed) — the cron's release path scans `order_items` for
  // positive `quantity_approved` regardless of how they got there.
  const qty = opts.qtyPerLine ?? 2;
  const limit = opts.productLimit ?? 1;
  const { data: prods } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .not("sku", "like", "E2E-%")
    .limit(limit);
  const itemRows = (prods ?? []).map((p) => ({
    order_id: orderId,
    product_id: p.id,
    quantity_requested: qty,
    quantity_approved: opts.status === "branch_approved" ? qty : null,
    unit_price_cents_snapshot: p.unit_price_cents,
    vat_rate_snapshot: p.vat_rate,
    line_net_cents: qty * p.unit_price_cents,
  }));
  await admin.from("order_items").insert(itemRows);

  // For step-2 fixtures, also bump inventory.quantity_reserved so the
  // release path has something to subtract.
  if (opts.status === "branch_approved") {
    for (const p of prods ?? []) {
      const { data: inv } = await admin
        .from("inventory")
        .select("quantity_reserved, quantity_on_hand")
        .eq("product_id", p.id)
        .maybeSingle();
      if (inv) {
        await admin
          .from("inventory")
          .update({ quantity_reserved: (inv.quantity_reserved ?? 0) + qty })
          .eq("product_id", p.id);
      } else {
        await admin.from("inventory").insert({
          product_id: p.id,
          quantity_on_hand: 0,
          quantity_reserved: qty,
        });
      }
      await admin.from("inventory_movements").insert({
        product_id: p.id,
        delta: -qty,
        reason: "order_reserved" as const,
        reference_type: "order",
        reference_id: orderId,
        actor_user_id: null,
      });
    }
  }

  return {
    id: orderId,
    orderNumber,
    productIds: (prods ?? []).map((p) => p.id),
  };
}

async function cleanup() {
  const { data } = await admin
    .from("orders")
    .select("id")
    .like("order_number", `${ORDER_PREFIX}%`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await admin
    .from("inventory_movements")
    .delete()
    .in("reference_id", ids)
    .in("reason", ["order_reserved", "order_released"]);
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "order")
    .in("entity_id", ids);
  await admin.from("orders").delete().in("id", ids);
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

test.describe("3.2.2c auto-cancel cron — step 1 (no branch approval)", () => {
  test("stale submitted order is cancelled with audit reason", async ({
    request,
  }) => {
    const { id: staleId } = await makeOrder({
      status: "submitted",
      ancient: true,
    });
    // Recent submitted (control) — must NOT be touched by the cron.
    const { id: recentId } = await makeOrder({
      status: "submitted",
      ancient: false,
    });

    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      cancelled: number;
      candidates: number;
    };
    expect(body.ok).toBe(true);
    expect(body.cancelled).toBeGreaterThanOrEqual(1);

    const { data: stale } = await admin
      .from("orders")
      .select("status, notes")
      .eq("id", staleId)
      .single();
    expect(stale?.status).toBe("cancelled");
    expect(stale?.notes).toMatch(/auto_cancel_no_branch_approval/);

    const { data: recent } = await admin
      .from("orders")
      .select("status")
      .eq("id", recentId)
      .single();
    expect(recent?.status).toBe("submitted");

    const { data: audit } = await admin
      .from("audit_log")
      .select("action, before_json, after_json, actor_user_id")
      .eq("entity_type", "order")
      .eq("entity_id", staleId)
      .eq("action", "auto_cancel_no_branch_approval")
      .single();
    expect(audit?.action).toBe("auto_cancel_no_branch_approval");
    expect(audit?.actor_user_id).toBeNull(); // system actor
    const before = audit?.before_json as { status?: string } | null;
    expect(before?.status).toBe("submitted");
  });
});

test.describe("3.2.2c auto-cancel cron — step 2 (no HQ approval)", () => {
  test("stale branch_approved order cancels and releases reservations", async ({
    request,
  }) => {
    const { id, productIds } = await makeOrder({
      status: "branch_approved",
      ancient: true,
      qtyPerLine: 4,
    });

    const { data: invBefore } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", productIds[0]!)
      .single();
    const reservedBefore = invBefore!.quantity_reserved;

    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      cancelled: number;
      reservations_released: number;
    };
    expect(body.cancelled).toBeGreaterThanOrEqual(1);
    expect(body.reservations_released).toBeGreaterThanOrEqual(1);

    const { data: order } = await admin
      .from("orders")
      .select("status, notes")
      .eq("id", id)
      .single();
    expect(order?.status).toBe("cancelled");
    expect(order?.notes).toMatch(/auto_cancel_no_hq_approval/);

    // Reservation released.
    const { data: invAfter } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", productIds[0]!)
      .single();
    expect(invAfter!.quantity_reserved).toBeLessThanOrEqual(reservedBefore - 4);

    const { data: rel } = await admin
      .from("inventory_movements")
      .select("reason")
      .eq("reference_id", id)
      .eq("reason", "order_released");
    expect((rel ?? []).length).toBeGreaterThan(0);

    const { data: audit } = await admin
      .from("audit_log")
      .select("action, actor_user_id")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .eq("action", "auto_cancel_no_hq_approval")
      .single();
    expect(audit?.action).toBe("auto_cancel_no_hq_approval");
    expect(audit?.actor_user_id).toBeNull();
  });

  test("recent branch_approved order is left alone", async ({ request }) => {
    const { id } = await makeOrder({
      status: "branch_approved",
      ancient: false,
    });
    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);
    const { data: order } = await admin
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();
    expect(order?.status).toBe("branch_approved");
  });
});

test.describe("3.2.2c auto-cancel cron — race + auth", () => {
  test("race: status changed under cron → silent skip, no audit row", async ({
    request,
  }) => {
    const { id } = await makeOrder({
      status: "submitted",
      ancient: true,
    });
    // Pre-empt the cron by approving the order directly.
    await admin
      .from("orders")
      .update({
        status: "branch_approved",
        branch_approved_at: new Date().toISOString(),
        branch_approved_by_user_id: await userId("ams.mgr@example.nl"),
      })
      .eq("id", id);

    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);

    // Order is now branch_approved (not stale at step-2 — branch_approved_at
    // is fresh). It must not have any auto_cancel audit row.
    const { data: order } = await admin
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();
    expect(order?.status).toBe("branch_approved");

    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .like("action", "auto_cancel_%");
    expect((audit ?? []).length).toBe(0);
  });

  test("CRON_SECRET enforces auth when set", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      test.skip(true, "CRON_SECRET not set in this environment");
      return;
    }
    const unauth = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(unauth.status()).toBe(401);
    const ok = await request.get("/api/cron/auto-cancel-stale-orders", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(ok.ok()).toBe(true);
  });
});
