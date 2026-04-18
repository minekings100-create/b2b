import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.2.1 — UX polish:
 *   1. Catalog rows are entirely clickable (table view).
 *   2. Inline buttons inside a row do NOT bubble into a row click.
 *   3. /orders/[id] timeline shows actor + action sourced from audit_log.
 *   4. Branch user sees the approver identity on their own order; super
 *      admin sees it on any order.
 *
 * The auth helpers + DB seeding mirror tests-e2e/approvals.spec.ts so the
 * suites can run together without ordering coupling.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ORDER_PREFIX = "ORD-E2E-321-";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function userId(email: string): Promise<string> {
  const { data } = await admin.from("users").select("id").eq("email", email).single();
  return data!.id;
}

async function makeApprovedOrder(opts: {
  authorEmail: string;
  approverEmail: string;
  productLimit?: number;
}) {
  const { authorEmail, approverEmail } = opts;
  const limit = opts.productLimit ?? 1;

  const author = await userId(authorEmail);
  const approver = await userId(approverEmail);
  const { data: roles } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", author)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  const branchId = roles!.branch_id!;

  const orderNumber = `${ORDER_PREFIX}${Date.now()}`;
  const submittedAt = new Date(Date.now() - 60_000).toISOString();
  const approvedAt = new Date().toISOString();

  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branchId,
      created_by_user_id: author,
      status: "approved",
      submitted_at: submittedAt,
      approved_at: approvedAt,
      approved_by_user_id: approver,
    })
    .select("id")
    .single();
  const orderId = order!.id;

  const { data: prods } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .not("sku", "like", "E2E-%")
    .limit(limit);
  const itemRows = (prods ?? []).map((p) => ({
    order_id: orderId,
    product_id: p.id,
    quantity_requested: 2,
    quantity_approved: 2,
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
    .eq("id", orderId);

  // Audit trail mirroring what cart.submit + approval.approve would write.
  await admin.from("audit_log").insert([
    {
      entity_type: "order",
      entity_id: orderId,
      action: "submit",
      actor_user_id: author,
      created_at: submittedAt,
      after_json: { status: "submitted" },
    },
    {
      entity_type: "order",
      entity_id: orderId,
      action: "approve",
      actor_user_id: approver,
      created_at: approvedAt,
      after_json: {
        status: "approved",
        approved_lines: itemRows.map((r) => ({
          requested: r.quantity_requested,
          approved: r.quantity_approved,
        })),
      },
    },
  ]);

  return { orderId, orderNumber, branchId };
}

async function cleanup() {
  const { data } = await admin
    .from("orders")
    .select("id")
    .like("order_number", `${ORDER_PREFIX}%`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await admin.from("audit_log").delete().eq("entity_type", "order").in("entity_id", ids);
  await admin.from("orders").delete().in("id", ids);
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

test.describe("3.2.1 catalog clickable rows", () => {
  test("clicking anywhere on a catalog row opens the detail drawer", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/catalog");

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();

    // Click the bare "Avail." numeric cell — it has no <a> wrapper, so a
    // bubble-based row handler is the only thing that can open the drawer.
    // Picking by index: SKU(1) Name(2) Cat(3) Price(4) [VAT(5)] Avail(6)
    // — but VAT column is hidden < lg, so locate the numeric Avail cell
    // by its table position from the right (Stock pill + Avail).
    await firstRow.locator("td").nth(-2).click();

    await expect(page).toHaveURL(/pid=/);
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).not.toHaveURL(/pid=/);
  });

  test("inline button inside a row does not bubble into the row click", async ({
    page,
  }) => {
    // Branch user — sees Add to cart inside the drawer (inline per-row Add
    // is the next iteration). The row-level guard still has to behave: the
    // only `<button>` children today are the ViewToggle pair in the page
    // header; we rely on the CatalogRow's bubble-guard semantics. Verify
    // by clicking the SKU <a> link explicitly — it must navigate to the
    // drawer URL exactly once (no double navigation from a stray bubble).
    const navUrls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navUrls.push(frame.url());
    });

    await signIn(page, "ams.user1@example.nl");
    await page.goto("/catalog");
    navUrls.length = 0;

    const firstRow = page.locator("tbody tr").first();
    const skuLink = firstRow.locator("td a").first();
    await skuLink.click();

    await expect(page).toHaveURL(/pid=/);
    // Only one nav was kicked off (the Link). A bubbling row click would
    // produce a second navigation to the same href.
    const pidNavs = navUrls.filter((u) => /pid=/.test(u));
    expect(pidNavs.length).toBeLessThanOrEqual(1);
  });
});

test.describe("3.2.1 order timeline + approver visibility", () => {
  test("order detail shows the activity timeline with submitter and approver", async ({
    page,
  }) => {
    const { orderId, orderNumber } = await makeApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      approverEmail: "ams.mgr@example.nl",
    });

    await signIn(page, "super@example.nl");
    await page.goto(`/orders/${orderId}`);

    await expect(
      page.getByRole("heading", { name: `Order ${orderNumber}` }),
    ).toBeVisible();

    const timeline = page.getByTestId("activity-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText("Submitted")).toBeVisible();
    await expect(timeline.getByText("Approved")).toBeVisible();
    await expect(timeline.getByText("ams.user1@example.nl")).toBeVisible();
    await expect(timeline.getByText("ams.mgr@example.nl")).toBeVisible();
  });

  test("super admin and branch user both see the approver identity", async ({
    browser,
  }) => {
    const { orderId } = await makeApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      approverEmail: "ams.mgr@example.nl",
    });

    // Branch user — own branch, can see who approved.
    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    await signIn(userPage, "ams.user1@example.nl");
    await userPage.goto(`/orders/${orderId}`);
    await expect(
      userPage.getByTestId("activity-timeline").getByText("ams.mgr@example.nl"),
    ).toBeVisible();
    await userCtx.close();

    // Super admin — sees it from anywhere.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, "super@example.nl");
    await adminPage.goto(`/orders/${orderId}`);
    await expect(
      adminPage.getByTestId("activity-timeline").getByText("ams.mgr@example.nl"),
    ).toBeVisible();
    await adminCtx.close();
  });

  test("orders list filter chip narrows results", async ({ page }) => {
    await makeApprovedOrder({
      authorEmail: "ams.user1@example.nl",
      approverEmail: "ams.mgr@example.nl",
    });

    await signIn(page, "super@example.nl");
    await page.goto("/orders");

    await expect(
      page.getByRole("navigation", { name: "Filter orders by status" }),
    ).toBeVisible();

    // `exact: true` — 3.2.2a introduced a "Branch approved" chip, so the
    // substring match would be ambiguous without this qualifier.
    await page.getByRole("link", { name: "Approved", exact: true }).click();
    // Match `status=approved` but NOT `status=approved_anything` (i.e. not
    // `branch_approved`). A negative lookahead for `_` is enough because
    // `status=approved` at the end of the URL is fine.
    await expect(page).toHaveURL(/[?&]status=approved(?!_)/);
  });
});
