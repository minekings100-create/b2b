import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 7a — sortable headers + role dashboards + HQ inline stock
 * preview.
 *
 * Test discipline (CLAUDE.md): dashboards touch responsive grid
 * breakpoints → run on all 3 viewports. Sort cycle is a click
 * sequence + URL params with no responsive layout impact → restricted
 * to desktop-1440 via `test.skip` based on the project name.
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

test.describe("Phase 7a — dashboards (3 viewports)", () => {
  test("branch user dashboard renders the branch-scoped stat trio", async ({
    page,
  }) => {
    await signIn(page, "ams.user1@example.nl");
    // Already on /dashboard after signIn.
    await expect(page.getByTestId("stat-open-orders")).toBeVisible();
    await expect(page.getByTestId("stat-open-invoices")).toBeVisible();
    await expect(page.getByTestId("stat-overdue")).toBeVisible();
    // Sub-link wires to /invoices?status=overdue.
    await expect(page.getByTestId("stat-overdue")).toHaveAttribute(
      "href",
      "/invoices?status=overdue",
    );
  });

  test("branch manager dashboard surfaces the pending-approvals card first", async ({
    page,
  }) => {
    await signIn(page, "ams.mgr@example.nl");
    await expect(page.getByTestId("stat-pending-approvals")).toBeVisible();
    await expect(page.getByTestId("stat-pending-approvals")).toHaveAttribute(
      "href",
      "/approvals",
    );
  });

  test("HQ manager dashboard shows awaiting-HQ + awaiting-branch counters", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    await expect(page.getByTestId("stat-awaiting-hq")).toBeVisible();
    await expect(page.getByTestId("stat-awaiting-branch")).toBeVisible();
  });

  test("packer dashboard shows pack-queue counters", async ({ page }) => {
    await signIn(page, "packer1@example.nl");
    await expect(page.getByTestId("stat-to-pack")).toBeVisible();
    await expect(page.getByTestId("stat-in-picking")).toBeVisible();
  });

  test("admin dashboard shows the cross-branch quartet incl MTD paid", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await expect(page.getByTestId("stat-open-orders")).toBeVisible();
    await expect(page.getByTestId("stat-open-invoices")).toBeVisible();
    await expect(page.getByTestId("stat-overdue")).toBeVisible();
    await expect(page.getByTestId("stat-mtd")).toBeVisible();
  });
});

test.describe("Phase 7a — sortable headers (desktop-1440 only)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "Sort cycle is non-responsive — desktop only per CLAUDE.md",
    );
  });

  test("clicking a header cycles asc → desc → reset and persists in the URL", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/orders");

    const totalHeader = page.getByTestId("sort-total_gross_cents");
    await expect(totalHeader).toHaveAttribute("data-sort-state", "none");

    // Click 1 → asc.
    await totalHeader.click();
    await page.waitForURL(/sort=total_gross_cents&dir=asc/);
    await expect(page.getByTestId("sort-total_gross_cents")).toHaveAttribute(
      "data-sort-state",
      "asc",
    );

    // Click 2 → desc.
    await page.getByTestId("sort-total_gross_cents").click();
    await page.waitForURL(/sort=total_gross_cents&dir=desc/);
    await expect(page.getByTestId("sort-total_gross_cents")).toHaveAttribute(
      "data-sort-state",
      "desc",
    );

    // Click 3 → reset (params dropped).
    await page.getByTestId("sort-total_gross_cents").click();
    await page.waitForURL((url) => !url.search.includes("sort="));
    await expect(page.getByTestId("sort-total_gross_cents")).toHaveAttribute(
      "data-sort-state",
      "none",
    );
  });

  test("status filter is preserved across a sort click", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/orders?status=submitted");
    await page.getByTestId("sort-total_gross_cents").click();
    await page.waitForURL(/status=submitted/);
    await page.waitForURL(/sort=total_gross_cents/);
  });

  test("invoices list also sorts via the same headers", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/invoices");
    await page.getByTestId("sort-invoice_number").click();
    await page.waitForURL(/sort=invoice_number&dir=asc/);
  });
});

test.describe("Phase 7a — HQ inline stock preview (desktop-1440)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "Static preview text — desktop only",
    );
  });

  test("preview text appears on the HQ approve form for approved lines", async ({
    page,
  }) => {
    // Seed a branch_approved order so the HQ approve form renders.
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("branch_code", "AMS")
      .single();
    const author = await userId("ams.user1@example.nl");
    const mgr = await userId("ams.mgr@example.nl");
    const { data: product } = await admin
      .from("products")
      .select("id, sku, unit_price_cents, vat_rate")
      .eq("active", true)
      .is("deleted_at", null)
      .limit(1)
      .single();

    const now = new Date().toISOString();
    const orderNumber = `ORD-HQ-${Date.now()}`;
    const { data: order } = await admin
      .from("orders")
      .insert({
        order_number: orderNumber,
        branch_id: branch!.id,
        created_by_user_id: author,
        status: "branch_approved",
        submitted_at: now,
        branch_approved_at: now,
        branch_approved_by_user_id: mgr,
      })
      .select("id")
      .single();
    const qty = 2;
    await admin.from("order_items").insert({
      order_id: order!.id,
      product_id: product!.id,
      quantity_requested: qty,
      quantity_approved: qty,
      unit_price_cents_snapshot: product!.unit_price_cents,
      vat_rate_snapshot: product!.vat_rate,
      line_net_cents: qty * product!.unit_price_cents,
    });

    try {
      await signIn(page, "hq.ops@example.nl");
      await page.goto(`/orders/${order!.id}`);
      // The HQ approve form is gated to branch_approved + HQ — so it
      // renders, and the inline preview should show.
      await expect(
        page.getByTestId(`hq-stock-preview-${product!.sku}`),
      ).toBeVisible();
      const txt = await page
        .getByTestId(`hq-stock-preview-${product!.sku}`)
        .textContent();
      expect(txt).toMatch(/on-hand \d+ → -?\d+ after pack/);
    } finally {
      await admin.from("order_items").delete().eq("order_id", order!.id);
      await admin.from("audit_log").delete().eq("entity_id", order!.id);
      await admin.from("orders").delete().eq("id", order!.id);
    }
  });
});
