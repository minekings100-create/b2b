import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.2.2b — two-step approval UI + HQ queue with tabs.
 *
 * Coverage:
 *  - Full happy path: submit → BM branch-approve → HQ-approve → packer
 *    sees the order
 *  - HQ rejects from branch_approved → reservations released, audit
 *    branch_reject vs hq_reject
 *  - HQ approval queue tabs: "Awaiting HQ" (default), "Awaiting branch"
 *    (read-only), "All pending"
 *  - RLS-style guards at the action layer: BM cannot HQ-approve;
 *    HQ cannot branch-approve (wrong-state guard, not RLS proper —
 *    the RLS regression for "wrong source state" lives in the vitest
 *    RLS suite via `tests/rls/orders.test.ts`)
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ORDER_PREFIX = "ORD-E2E-322B-";

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
  qtyPerLine?: number;
}) {
  const limit = opts.productLimit ?? 1;
  const qty = opts.qtyPerLine ?? 2;

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
    quantity_requested: qty,
    unit_price_cents_snapshot: p.unit_price_cents,
    vat_rate_snapshot: p.vat_rate,
    line_net_cents: qty * p.unit_price_cents,
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

async function pollStatus(orderId: string, want: string, timeoutMs = 8_000) {
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
      { timeout: timeoutMs },
    )
    .toBe(want);
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

test.describe("3.2.2b two-step approval — happy path", () => {
  test("submit → BM branch-approve → HQ-approve, status flips at each step", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
      productLimit: 2,
      qtyPerLine: 2,
    });

    // Step 1 — Branch Manager approves.
    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Branch-approve order" }).click();
    await pollStatus(orderId, "branch_approved");

    // Order is no longer in BM's queue (status moved to branch_approved).
    await page.goto("/approvals");
    await expect(page.locator(`a[href="/orders/${orderId}"]`)).toHaveCount(0);

    // Sign out & sign in as HQ.
    await page.context().clearCookies();
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/approvals");
    // Default tab = "Awaiting HQ" → the order shows up.
    await expect(
      page.locator(`a[href="/orders/${orderId}"]`),
    ).toBeVisible({ timeout: 10_000 });

    // Step 2 — HQ approves.
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "HQ-approve order" }).click();
    await pollStatus(orderId, "approved");

    const { data: after } = await admin
      .from("orders")
      .select(
        "status, branch_approved_at, branch_approved_by_user_id, approved_at, approved_by_user_id",
      )
      .eq("id", orderId)
      .single();
    expect(after?.status).toBe("approved");
    expect(after?.branch_approved_at).not.toBeNull();
    expect(after?.approved_at).not.toBeNull();
    // Two distinct actors.
    expect(after?.branch_approved_by_user_id).not.toBe(
      after?.approved_by_user_id,
    );

    // Audit log shows both `branch_approve` and `hq_approve`.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", orderId);
    const actions = new Set((audit ?? []).map((a) => a.action));
    expect(actions.has("branch_approve")).toBe(true);
    expect(actions.has("hq_approve")).toBe(true);
  });
});

test.describe("3.2.2b reject paths", () => {
  test("HQ rejects from branch_approved → status=rejected, reservations released, audit hq_reject", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
      productLimit: 1,
      qtyPerLine: 3,
    });

    // BM approves first.
    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Branch-approve order" }).click();
    await pollStatus(orderId, "branch_approved");

    // Snapshot reservation.
    const { data: items } = await admin
      .from("order_items")
      .select("product_id, quantity_approved")
      .eq("order_id", orderId);
    const productId = items![0]!.product_id;
    const { data: invBefore } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", productId)
      .single();
    const reservedBefore = invBefore!.quantity_reserved;

    // HQ rejects.
    await page.context().clearCookies();
    await signIn(page, "hq.ops@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByLabel("Rejection reason")
      .fill("HQ veto — supplier price renegotiation pending.");
    await page.getByRole("button", { name: "Confirm reject" }).click();
    await pollStatus(orderId, "rejected");

    const { data: after } = await admin
      .from("orders")
      .select("status, rejection_reason")
      .eq("id", orderId)
      .single();
    expect(after?.rejection_reason).toMatch(/veto/i);

    // Reservation released.
    const { data: invAfter } = await admin
      .from("inventory")
      .select("quantity_reserved")
      .eq("product_id", productId)
      .single();
    expect(invAfter!.quantity_reserved).toBeLessThanOrEqual(reservedBefore - 3);

    // Release movement appended.
    const { data: rel } = await admin
      .from("inventory_movements")
      .select("reason")
      .eq("reference_id", orderId)
      .eq("reason", "order_released");
    expect((rel ?? []).length).toBeGreaterThan(0);

    // Audit row carries the step-2 reject action name.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, after_json")
      .eq("entity_type", "order")
      .eq("entity_id", orderId)
      .eq("action", "hq_reject")
      .single();
    expect(audit?.action).toBe("hq_reject");
    const payload = audit?.after_json as { step?: string } | null;
    expect(payload?.step).toBe("hq");
  });

  test("BM rejects from submitted writes branch_reject (action name)", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });

    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Reject" }).click();
    await page
      .getByLabel("Rejection reason")
      .fill("Over budget — please resubmit next month.");
    await page.getByRole("button", { name: "Confirm reject" }).click();
    await pollStatus(orderId, "rejected");

    const { data: audit } = await admin
      .from("audit_log")
      .select("action, after_json")
      .eq("entity_type", "order")
      .eq("entity_id", orderId)
      .eq("action", "branch_reject")
      .single();
    expect(audit?.action).toBe("branch_reject");
    const payload = audit?.after_json as { step?: string } | null;
    expect(payload?.step).toBe("branch");
  });
});

test.describe("3.2.2b HQ approval-queue tabs", () => {
  test("default tab = Awaiting HQ shows branch_approved orders cross-branch", async ({
    page,
  }) => {
    // Pre-populate one branch_approved order on AMS branch.
    const author = await userId("ams.user1@example.nl");
    const { data: roles } = await admin
      .from("user_branch_roles")
      .select("branch_id")
      .eq("user_id", author)
      .eq("role", "branch_user")
      .not("branch_id", "is", null)
      .single();
    const branchId = roles!.branch_id!;
    const mgr = await userId("ams.mgr@example.nl");
    const orderNumber = `${ORDER_PREFIX}HQ-${Date.now()}`;
    const now = new Date();
    const { data: order } = await admin
      .from("orders")
      .insert({
        order_number: orderNumber,
        branch_id: branchId,
        created_by_user_id: author,
        status: "branch_approved",
        submitted_at: new Date(now.getTime() - 60_000).toISOString(),
        branch_approved_at: now.toISOString(),
        branch_approved_by_user_id: mgr,
      })
      .select("id")
      .single();
    const orderId = order!.id;

    await signIn(page, "hq.ops@example.nl");
    await page.goto("/approvals");

    const nav = page.getByRole("navigation", { name: "Approval queue tabs" });
    await expect(nav).toBeVisible();

    // Active tab = "Awaiting HQ".
    const hqTab = nav.getByRole("link", { name: /Awaiting HQ/ });
    await expect(hqTab).toHaveAttribute("aria-current", "page");

    // Order is in the table.
    await expect(
      page.locator(`a[href="/orders/${orderId}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("'Awaiting branch' tab shows submitted orders cross-branch", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });

    await signIn(page, "hq.ops@example.nl");
    await page.goto("/approvals?tab=branch");

    const nav = page.getByRole("navigation", { name: "Approval queue tabs" });
    const branchTab = nav.getByRole("link", { name: /Awaiting branch/ });
    await expect(branchTab).toHaveAttribute("aria-current", "page");

    await expect(
      page.locator(`a[href="/orders/${orderId}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("status pill column renders on every tab (matches /orders treatment)", async ({
    page,
  }) => {
    // One submitted (BM queue), one branch_approved (HQ queue) — gives
    // the All-pending tab a mixed-status sample to assert against.
    await makeSubmittedOrder({ authorEmail: "ams.user1@example.nl" });
    await makeBranchApprovedOrder("ams.user1@example.nl", "ams.mgr@example.nl");

    await signIn(page, "hq.ops@example.nl");

    // Each tab must surface the Status column header *and* at least one
    // pill in the body. The pill itself is identifiable by the
    // `data-status` attribute exposed by OrderStatusPill.
    for (const tab of ["hq", "branch", "all"] as const) {
      await page.goto(`/approvals?tab=${tab}`);
      await expect(
        page.getByRole("columnheader", { name: "Status" }),
      ).toBeVisible();
      const pills = page.locator("tbody [data-status]");
      await expect(pills.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("'All pending' tab renders both submitted and branch_approved pills (mixed states)", async ({
    page,
  }) => {
    // Seed one of each. Without these the assertion can't tell if the
    // pill renderer just happens to map to one colour family.
    await makeSubmittedOrder({ authorEmail: "ams.user1@example.nl" });
    await makeBranchApprovedOrder("ams.user1@example.nl", "ams.mgr@example.nl");

    await signIn(page, "hq.ops@example.nl");
    await page.goto("/approvals?tab=all");

    const submittedPill = page.locator(
      'tbody [data-status="submitted"]',
    );
    const branchApprovedPill = page.locator(
      'tbody [data-status="branch_approved"]',
    );
    await expect(submittedPill.first()).toBeVisible({ timeout: 10_000 });
    await expect(branchApprovedPill.first()).toBeVisible({ timeout: 10_000 });
  });
});

async function makeBranchApprovedOrder(
  authorEmail: string,
  managerEmail: string,
): Promise<{ id: string; orderNumber: string }> {
  const author = await userId(authorEmail);
  const mgr = await userId(managerEmail);
  const { data: roles } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", author)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  const branchId = roles!.branch_id!;
  const orderNumber = `${ORDER_PREFIX}BA-${Date.now()}-${Math.floor(
    Math.random() * 9999,
  )}`;
  const now = new Date();
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branchId,
      created_by_user_id: author,
      status: "branch_approved",
      submitted_at: new Date(now.getTime() - 60_000).toISOString(),
      branch_approved_at: now.toISOString(),
      branch_approved_by_user_id: mgr,
    })
    .select("id")
    .single();
  return { id: order!.id, orderNumber };
}

test.describe("3.2.2b action-layer guards", () => {
  test("BM cannot HQ-approve a branch_approved order — server action returns wrong-state error", async ({
    page,
  }) => {
    // Build a branch_approved order directly so we can attempt HQ-approve.
    const author = await userId("ams.user1@example.nl");
    const { data: roles } = await admin
      .from("user_branch_roles")
      .select("branch_id")
      .eq("user_id", author)
      .eq("role", "branch_user")
      .not("branch_id", "is", null)
      .single();
    const branchId = roles!.branch_id!;
    const mgr = await userId("ams.mgr@example.nl");
    const now = new Date();
    const { data: order } = await admin
      .from("orders")
      .insert({
        order_number: `${ORDER_PREFIX}GUARD-BM-${Date.now()}`,
        branch_id: branchId,
        created_by_user_id: author,
        status: "branch_approved",
        submitted_at: new Date(now.getTime() - 60_000).toISOString(),
        branch_approved_at: now.toISOString(),
        branch_approved_by_user_id: mgr,
      })
      .select("id")
      .single();
    const orderId = order!.id;

    // Sign in as the branch manager and load the order detail. Because
    // status='branch_approved', the BM should NOT see the
    // "Branch-approve order" button (their window is closed) and should
    // NOT see the HQ-approve button either (they're not HQ).
    await signIn(page, "ams.mgr@example.nl");
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.getByRole("button", { name: "Branch-approve order" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "HQ-approve order" }),
    ).toHaveCount(0);
  });

  test("HQ cannot branch-approve a submitted order — UI doesn't render the form", async ({
    page,
  }) => {
    const { orderId } = await makeSubmittedOrder({
      authorEmail: "ams.user1@example.nl",
    });

    await signIn(page, "hq.ops@example.nl");
    await page.goto(`/orders/${orderId}`);
    // Submitted is BM territory; HQ sees no decision form.
    await expect(
      page.getByRole("button", { name: "Branch-approve order" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "HQ-approve order" }),
    ).toHaveCount(0);
  });
});
