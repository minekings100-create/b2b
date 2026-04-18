import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.3.1, post-3.2.2-rebase — every order lifecycle trigger
 * writes the right `notifications` rows. Email transport is console-only
 * in this milestone, so we assert against the table (the 3.3.2 bell will
 * read the same data).
 *
 * Triggers covered:
 *   - submit                          → branch managers
 *     (cart-submit happy path is exercised by tests-e2e/cart-submit.spec.ts;
 *      the override-overdue admin notification is asserted there too)
 *   - branch-approve (BM)             → HQ managers (`order_branch_approved`)
 *   - HQ-approve (HQ)                 → packers (`order_approved`)
 *   - reject from submitted (BM)      → creator (`order_branch_rejected`)
 *   - reject from branch_approved (HQ)
 *       → creator (`order_hq_rejected`) AND BM who approved step 1
 *         (`order_hq_rejected_to_branch_manager`)
 *   - cancel (manual)                 → branch managers (`order_cancelled`)
 *   - cron submitted_awaiting_branch_reminder + branch_approved_awaiting_hq_reminder
 *   - cron order_auto_cancelled (drives the 3.2.2c cron and asserts the
 *     post-rebase notification side-effect lands)
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ORDER_PREFIX = "ORD-E2E-331-";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function makeSubmittedOrder(opts: {
  authorEmail: string;
  productLimit?: number;
}) {
  const limit = opts.productLimit ?? 1;
  const author = await userId(opts.authorEmail);
  const { data: roles } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", author)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  const branchId = roles!.branch_id!;

  const orderNumber = `${ORDER_PREFIX}${Date.now()}-${Math.floor(
    Math.random() * 9999,
  )}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branchId,
      created_by_user_id: author,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const { data: prods } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .not("sku", "like", "E2E-%")
    .limit(limit);
  const itemRows = (prods ?? []).map((p) => ({
    order_id: order!.id,
    product_id: p.id,
    quantity_requested: 2,
    unit_price_cents_snapshot: p.unit_price_cents,
    vat_rate_snapshot: p.vat_rate,
    line_net_cents: 2 * p.unit_price_cents,
  }));
  await admin.from("order_items").insert(itemRows);
  const net = itemRows.reduce((a, r) => a + r.line_net_cents, 0);
  await admin
    .from("orders")
    .update({
      total_net_cents: net,
      total_vat_cents: 0,
      total_gross_cents: net,
    })
    .eq("id", order!.id);

  return { orderId: order!.id, orderNumber, branchId, authorId: author };
}

async function makeBranchApprovedOrder(opts: {
  authorEmail: string;
  branchManagerEmail: string;
}) {
  const base = await makeSubmittedOrder({ authorEmail: opts.authorEmail });
  const mgr = await userId(opts.branchManagerEmail);
  // Promote items + flip status directly so the test fixture isn't
  // coupled to the BM-approve UI (and so we don't accidentally fire
  // additional notifications mid-fixture).
  const { data: items } = await admin
    .from("order_items")
    .select("id, quantity_requested")
    .eq("order_id", base.orderId);
  for (const it of items ?? []) {
    await admin
      .from("order_items")
      .update({ quantity_approved: it.quantity_requested })
      .eq("id", it.id);
  }
  await admin
    .from("orders")
    .update({
      status: "branch_approved",
      branch_approved_at: new Date().toISOString(),
      branch_approved_by_user_id: mgr,
    })
    .eq("id", base.orderId);
  return { ...base, branchApproverId: mgr };
}

async function clearNotifications(orderId: string) {
  await admin
    .from("notifications")
    .delete()
    .filter("payload_json->>order_id", "eq", orderId);
}

async function cleanupOrders() {
  const { data } = await admin
    .from("orders")
    .select("id")
    .like("order_number", `${ORDER_PREFIX}%`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  for (const id of ids) await clearNotifications(id);
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

async function notificationsForOrder(orderId: string, type: string) {
  const { data } = await admin
    .from("notifications")
    .select("user_id, type, payload_json")
    .eq("type", type)
    .filter("payload_json->>order_id", "eq", orderId);
  return data ?? [];
}

/**
 * Wait until the trigger has written notifications for this order.
 * Server Action redirects to the same `/orders/{id}` URL, so Playwright
 * can resume before the awaited side-effect lands — polling the table
 * is the only reliable gate.
 */
async function pollNotificationsForOrder(
  orderId: string,
  type: string,
  expectedCount: number,
  timeoutMs = 10_000,
) {
  const start = Date.now();
  let last: Awaited<ReturnType<typeof notificationsForOrder>> = [];
  while (Date.now() - start < timeoutMs) {
    last = await notificationsForOrder(orderId, type);
    if (last.length >= expectedCount) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

test.beforeEach(cleanupOrders);
test.afterAll(cleanupOrders);

test.describe("3.3.1 lifecycle triggers (post-3.2.2 rebase)", () => {
  test("BM branch-approve writes order_branch_approved to every HQ Manager", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });

    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Branch-approve order" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .single();
        return data?.status ?? null;
      }, { timeout: 5_000 })
      .toBe("branch_approved");

    const { data: hqs } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("role", "hq_operations_manager")
      .is("deleted_at", null);
    const hqIds = new Set((hqs ?? []).map((r) => r.user_id));
    expect(hqIds.size).toBeGreaterThan(0);
    const notifs = await pollNotificationsForOrder(
      orderId,
      "order_branch_approved",
      hqIds.size,
    );
    expect(notifs.length).toBe(hqIds.size);
    for (const n of notifs) expect(hqIds.has(n.user_id)).toBe(true);
  });

  test("HQ-approve writes order_approved to every packer", async ({ page }) => {
    const { orderId } = await makeBranchApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      branchManagerEmail: "ams.mgr@example.nl",
    });

    await signIn(page, "hq.ops@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "HQ-approve order" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .single();
        return data?.status ?? null;
      }, { timeout: 5_000 })
      .toBe("approved");

    const { data: packers } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("role", "packer")
      .is("deleted_at", null);
    const packerIds = new Set((packers ?? []).map((r) => r.user_id));
    const notifs = await pollNotificationsForOrder(
      orderId,
      "order_approved",
      packerIds.size,
    );
    expect(notifs.length).toBe(packerIds.size);
    for (const n of notifs) expect(packerIds.has(n.user_id)).toBe(true);
  });

  test("BM reject from submitted writes order_branch_rejected to creator", async ({
    page,
  }) => {
    const { orderId, authorId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });

    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByLabel("Rejection reason")
      .fill("Over monthly budget — please resubmit next month.");
    await page.getByRole("button", { name: "Confirm reject" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .single();
        return data?.status ?? null;
      }, { timeout: 5_000 })
      .toBe("rejected");

    const notifs = await pollNotificationsForOrder(
      orderId,
      "order_branch_rejected",
      1,
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.user_id).toBe(authorId);
    const payload = notifs[0]!.payload_json as {
      reason?: string;
      step?: string;
    };
    expect(payload.reason).toMatch(/budget/i);
    expect(payload.step).toBe("branch");
  });

  test("HQ reject from branch_approved fans out to creator AND the BM who approved step 1", async ({
    page,
  }) => {
    const { orderId, authorId, branchApproverId } =
      await makeBranchApprovedOrder({
        authorEmail: "ams.user1@example.nl",
        branchManagerEmail: "ams.mgr@example.nl",
      });

    await signIn(page, "hq.ops@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByLabel("Rejection reason")
      .fill("Supplier price renegotiation pending — postpone.");
    await page.getByRole("button", { name: "Confirm reject" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .single();
        return data?.status ?? null;
      }, { timeout: 5_000 })
      .toBe("rejected");

    const creatorNotifs = await pollNotificationsForOrder(
      orderId,
      "order_hq_rejected",
      1,
    );
    expect(creatorNotifs).toHaveLength(1);
    expect(creatorNotifs[0]!.user_id).toBe(authorId);

    const bmNotifs = await pollNotificationsForOrder(
      orderId,
      "order_hq_rejected_to_branch_manager",
      1,
    );
    expect(bmNotifs).toHaveLength(1);
    expect(bmNotifs[0]!.user_id).toBe(branchApproverId);
  });

  test("manual cancel writes order_cancelled to branch managers", async ({
    page,
  }) => {
    const { orderId, branchId } = await makeBranchApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      branchManagerEmail: "ams.mgr@example.nl",
    });

    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .single();
        return data?.status ?? null;
      }, { timeout: 5_000 })
      .toBe("cancelled");

    const { data: managers } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("branch_id", branchId)
      .eq("role", "branch_manager")
      .is("deleted_at", null);
    const mgrIds = new Set((managers ?? []).map((r) => r.user_id));
    const notifs = await pollNotificationsForOrder(
      orderId,
      "order_cancelled",
      mgrIds.size,
    );
    expect(notifs.length).toBe(mgrIds.size);
    for (const n of notifs) expect(mgrIds.has(n.user_id)).toBe(true);
    const payload = notifs[0]!.payload_json as { prior_status?: string };
    expect(payload.prior_status).toBe("branch_approved");
  });
});

test.describe("3.3.1 awaiting-approval reminder cron — split digests", () => {
  test("step-1 digest writes one submitted_awaiting_branch_reminder per branch manager", async ({
    request,
  }) => {
    const ancient = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const first = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });
    const second = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });
    await admin
      .from("orders")
      .update({ submitted_at: ancient })
      .in("id", [first.orderId, second.orderId]);

    const res = await request.get("/api/cron/awaiting-approval");
    expect(res.ok()).toBe(true);

    const { data: managers } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("branch_id", first.branchId)
      .eq("role", "branch_manager")
      .is("deleted_at", null);

    for (const m of managers ?? []) {
      const { data: notifs } = await admin
        .from("notifications")
        .select("payload_json")
        .eq("type", "submitted_awaiting_branch_reminder")
        .eq("user_id", m.user_id)
        .order("sent_at", { ascending: false })
        .limit(1);
      expect(notifs?.length).toBe(1);
      const payload = notifs![0]!.payload_json as {
        waiting_count?: number;
        waiting_order_ids?: string[];
      };
      expect(payload.waiting_count).toBeGreaterThanOrEqual(2);
      expect(payload.waiting_order_ids).toContain(first.orderId);
      expect(payload.waiting_order_ids).toContain(second.orderId);
    }

    if (managers) {
      await admin
        .from("notifications")
        .delete()
        .eq("type", "submitted_awaiting_branch_reminder")
        .in(
          "user_id",
          managers.map((m) => m.user_id),
        );
    }
  });

  test("step-2 digest writes branch_approved_awaiting_hq_reminder to every HQ Manager", async ({
    request,
  }) => {
    const ancient = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const order = await makeBranchApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      branchManagerEmail: "ams.mgr@example.nl",
    });
    await admin
      .from("orders")
      .update({ branch_approved_at: ancient })
      .eq("id", order.orderId);

    const res = await request.get("/api/cron/awaiting-approval");
    expect(res.ok()).toBe(true);

    const { data: hqs } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("role", "hq_operations_manager")
      .is("deleted_at", null);

    for (const h of hqs ?? []) {
      const { data: notifs } = await admin
        .from("notifications")
        .select("payload_json")
        .eq("type", "branch_approved_awaiting_hq_reminder")
        .eq("user_id", h.user_id)
        .order("sent_at", { ascending: false })
        .limit(1);
      expect(notifs?.length).toBe(1);
      const payload = notifs![0]!.payload_json as {
        waiting_count?: number;
        waiting_order_ids?: string[];
      };
      expect(payload.waiting_count).toBeGreaterThanOrEqual(1);
      expect(payload.waiting_order_ids).toContain(order.orderId);
    }

    if (hqs) {
      await admin
        .from("notifications")
        .delete()
        .eq("type", "branch_approved_awaiting_hq_reminder")
        .in(
          "user_id",
          hqs.map((h) => h.user_id),
        );
    }
  });

  test("CRON_SECRET enforces auth when set in env", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      test.skip(true, "CRON_SECRET not set in this environment");
      return;
    }
    const unauth = await request.get("/api/cron/awaiting-approval");
    expect(unauth.status()).toBe(401);
    const ok = await request.get("/api/cron/awaiting-approval", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(ok.ok()).toBe(true);
  });
});

test.describe("3.3.1 auto-cancel notifications (post-rebase 3.2.2c integration)", () => {
  test("step-1 auto-cancel notifies creator + branch managers", async ({
    request,
  }) => {
    // 10 calendar days ago → guaranteed > 2 working days for any DST.
    const ancient = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const order = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });
    await admin
      .from("orders")
      .update({ submitted_at: ancient })
      .eq("id", order.orderId);

    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);

    const { data: managers } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("branch_id", order.branchId)
      .eq("role", "branch_manager")
      .is("deleted_at", null);
    const expectedIds = new Set([
      order.authorId,
      ...((managers ?? []).map((m) => m.user_id)),
    ]);

    const notifs = await pollNotificationsForOrder(
      order.orderId,
      "order_auto_cancelled",
      expectedIds.size,
    );
    expect(notifs.length).toBe(expectedIds.size);
    for (const n of notifs) expect(expectedIds.has(n.user_id)).toBe(true);
    const payload = notifs[0]!.payload_json as { step?: string };
    expect(payload.step).toBe("branch");
  });

  test("step-2 auto-cancel notifies creator + BM-who-approved + HQ + admins", async ({
    request,
  }) => {
    const ancient = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const order = await makeBranchApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      branchManagerEmail: "ams.mgr@example.nl",
    });
    await admin
      .from("orders")
      .update({ branch_approved_at: ancient })
      .eq("id", order.orderId);

    const res = await request.get("/api/cron/auto-cancel-stale-orders");
    expect(res.ok()).toBe(true);

    // Audience: creator + branch managers + HQ Managers + administration.
    const { data: branchMgrs } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("branch_id", order.branchId)
      .eq("role", "branch_manager")
      .is("deleted_at", null);
    const { data: hqs } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .eq("role", "hq_operations_manager")
      .is("deleted_at", null);
    const { data: admins } = await admin
      .from("user_branch_roles")
      .select("user_id")
      .in("role", ["administration", "super_admin"])
      .is("deleted_at", null);
    const expectedIds = new Set<string>([
      order.authorId,
      order.branchApproverId,
      ...((branchMgrs ?? []).map((m) => m.user_id)),
      ...((hqs ?? []).map((h) => h.user_id)),
      ...((admins ?? []).map((a) => a.user_id)),
    ]);

    const notifs = await pollNotificationsForOrder(
      order.orderId,
      "order_auto_cancelled",
      expectedIds.size,
    );
    expect(notifs.length).toBe(expectedIds.size);
    const got = new Set(notifs.map((n) => n.user_id));
    for (const id of expectedIds) {
      expect(got.has(id)).toBe(true);
    }
    const payload = notifs[0]!.payload_json as { step?: string };
    expect(payload.step).toBe("hq");
  });
});
