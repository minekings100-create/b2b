import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 8 — packer workflow v2.
 *
 * Three features under test:
 *   1. Claim system with 30-min TTL + lazy cleanup on queue render
 *   2. Rush flag (creator-at-submit + HQ/admin post-submit)
 *   3. Pick-any reorder — packer is free to open any unclaimed row
 *
 * All tests exercise the real DB (seeds a fixture order, cleans it up
 * in `afterAll`) and the real RLS path. Desktop-1440 only — pack UI
 * already runs on all viewports via the Phase 4 spec.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "E2E-PHASE8-";

async function uidOf(email: string): Promise<string> {
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

async function seedApprovedOrder(opts: {
  isRush?: boolean;
  approvedMinutesAgo?: number;
}): Promise<{ id: string; orderNumber: string }> {
  const author = await uidOf("ams.user1@example.nl");
  const bm = await uidOf("ams.mgr@example.nl");
  const hq = await uidOf("hq.ops@example.nl");
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", "AMS")
    .single();
  const { data: product } = await admin
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .eq("active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  const approvedAt = new Date(
    Date.now() - (opts.approvedMinutesAgo ?? 60) * 60 * 1000,
  );
  const orderNumber = `${FIXTURE_PREFIX}${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const { data: order } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: branch!.id,
      created_by_user_id: author,
      status: "approved",
      submitted_at: approvedAt.toISOString(),
      branch_approved_at: approvedAt.toISOString(),
      branch_approved_by_user_id: bm,
      approved_at: approvedAt.toISOString(),
      approved_by_user_id: hq,
      is_rush: opts.isRush ?? false,
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

  return { id: order!.id, orderNumber };
}

async function cleanup() {
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .like("order_number", `${FIXTURE_PREFIX}%`);
  const ids = (orders ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await admin
    .from("pallet_items")
    .delete()
    .in(
      "pallet_id",
      (
        await admin.from("pallets").select("id").in("order_id", ids)
      ).data?.map((p) => p.id) ?? [],
    );
  await admin.from("pallets").delete().in("order_id", ids);
  await admin.from("order_items").delete().in("order_id", ids);
  await admin.from("audit_log").delete().eq("entity_type", "order").in("entity_id", ids);
  await admin.from("orders").delete().in("id", ids);
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

test.describe("Phase 8 — claim system", () => {
  test("packer1 claims + releases — audit trail complete", async ({
    page,
  }) => {
    const { id, orderNumber } = await seedApprovedOrder({});
    await signIn(page, "packer1@example.nl");
    await page.goto("/pack");
    const row = page.locator("tr", { hasText: orderNumber });
    await row.getByRole("button", { name: `Claim ${orderNumber}` }).click();
    await expect(row).toHaveAttribute("data-claim-state", "mine", {
      timeout: 5_000,
    });
    await row
      .getByRole("button", { name: `Release ${orderNumber}` })
      .click();
    await expect(row).toHaveAttribute("data-claim-state", "available", {
      timeout: 5_000,
    });

    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .in("action", ["order_claim", "order_release"]);
    const actions = (audit ?? []).map((a) => a.action);
    expect(actions).toContain("order_claim");
    expect(actions).toContain("order_release");
  });

  test("other packer sees 'Claimed by <name>' + cannot act", async ({
    page,
  }) => {
    const { id, orderNumber } = await seedApprovedOrder({});
    // Seed the claim directly — avoids the need to juggle two browser
    // sessions in a single test.
    await admin
      .from("orders")
      .update({
        claimed_by_user_id: await uidOf("packer1@example.nl"),
        claimed_at: new Date().toISOString(),
      })
      .eq("id", id);

    await signIn(page, "packer2@example.nl");
    await page.goto("/pack");
    const row = page.locator("tr", { hasText: orderNumber });
    await expect(row).toHaveAttribute("data-claim-state", "other");
    await expect(
      row.getByTestId(`claimed-by-${orderNumber}`),
    ).toHaveText("packer1@example.nl");
    // No Claim button available to packer2 for this row.
    await expect(
      row.getByRole("button", { name: `Claim ${orderNumber}` }),
    ).toHaveCount(0);

    // Open the pack detail — claim banner in "other" state, no ScanInput.
    await page.goto(`/pack/${id}`);
    const banner = page.getByTestId("claim-banner");
    await expect(banner).toHaveAttribute("data-claim-state", "other");
    await expect(page.locator('input[name="barcode"]')).toHaveCount(0);
  });

  test("stale claim (> TTL) is cleared on next queue load + audited as expired", async ({
    page,
  }) => {
    const { id, orderNumber } = await seedApprovedOrder({});
    // Seed a stale claim directly — 45 min old, TTL is 30.
    await admin
      .from("orders")
      .update({
        claimed_by_user_id: await uidOf("packer1@example.nl"),
        claimed_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      })
      .eq("id", id);

    await signIn(page, "packer2@example.nl");
    await page.goto("/pack");
    // The queue sweep should have cleared it by render time.
    const row = page.locator("tr", { hasText: orderNumber });
    await expect(row).toHaveAttribute("data-claim-state", "available");

    // An audit row with action='order_claim_expired' was written.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, actor_user_id")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .eq("action", "order_claim_expired")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit?.[0]?.action).toBe("order_claim_expired");
    expect(audit?.[0]?.actor_user_id).toBeNull(); // system actor
  });

  test("admin override releases another packer's claim", async ({
    page,
    browser,
  }) => {
    const { id, orderNumber } = await seedApprovedOrder({});
    await admin
      .from("orders")
      .update({
        claimed_by_user_id: await uidOf("packer1@example.nl"),
        claimed_at: new Date().toISOString(),
      })
      .eq("id", id);

    await signIn(page, "super@example.nl");
    await page.goto("/pack");
    const row = page.locator("tr", { hasText: orderNumber });
    await expect(row).toHaveAttribute("data-claim-state", "other");
    await row
      .getByRole("button", { name: `Admin release ${orderNumber}` })
      .click();
    await expect(row).toHaveAttribute("data-claim-state", "available", {
      timeout: 5_000,
    });

    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .eq("action", "order_claim_admin_release");
    expect(audit?.length).toBeGreaterThan(0);
    void browser;
  });
});

test.describe("Phase 8 — rush flag", () => {
  test("rushed order sorts above older non-rush orders", async ({ page }) => {
    const older = await seedApprovedOrder({
      isRush: false,
      approvedMinutesAgo: 120,
    });
    const rushed = await seedApprovedOrder({
      isRush: true,
      approvedMinutesAgo: 10,
    });

    await signIn(page, "packer1@example.nl");
    await page.goto("/pack");

    // The rushed row must appear before the older non-rush row.
    const rows = page.locator("tbody tr");
    const texts = await rows.allInnerTexts();
    const rushIdx = texts.findIndex((t) => t.includes(rushed.orderNumber));
    const olderIdx = texts.findIndex((t) => t.includes(older.orderNumber));
    expect(rushIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    expect(rushIdx).toBeLessThan(olderIdx);

    // Rush badge rendered on the rushed row.
    const rushedRow = page.locator("tr", { hasText: rushed.orderNumber });
    await expect(rushedRow.getByTestId("rush-badge")).toBeVisible();
  });

  test("HQ manager flips rush on an existing order via order detail", async ({
    page,
  }) => {
    const { id, orderNumber } = await seedApprovedOrder({ isRush: false });

    await signIn(page, "hq.ops@example.nl");
    await page.goto(`/orders/${id}`);
    await expect(
      page.getByRole("heading", { name: `Order ${orderNumber}` }),
    ).toBeVisible();
    await page.getByTestId("rush-toggle").click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("orders")
          .select("is_rush")
          .eq("id", id)
          .single();
        return data?.is_rush;
      })
      .toBe(true);

    // Audit row for the flip.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", id)
      .eq("action", "order_rush_set");
    expect(audit?.length).toBeGreaterThan(0);
  });

  test("branch user sees no rush toggle on order detail (gated to HQ/admin)", async ({
    page,
  }) => {
    const { id } = await seedApprovedOrder({ isRush: false });
    await signIn(page, "ams.user1@example.nl");
    await page.goto(`/orders/${id}`);
    await expect(page.getByTestId("rush-toggle")).toHaveCount(0);
  });
});

test.describe("Phase 8 — pick-any", () => {
  test("packer can open the third row in the queue directly (no FIFO lock)", async ({
    page,
  }) => {
    const first = await seedApprovedOrder({ approvedMinutesAgo: 180 });
    await seedApprovedOrder({ approvedMinutesAgo: 120 });
    const third = await seedApprovedOrder({ approvedMinutesAgo: 60 });

    await signIn(page, "packer1@example.nl");
    await page.goto("/pack");

    // Open the third row directly — demonstrates pick-any freedom.
    await page
      .locator("tr", { hasText: third.orderNumber })
      .getByRole("link", { name: third.orderNumber })
      .click();
    await expect(
      page.getByRole("heading", { name: `Pack ${third.orderNumber}` }),
    ).toBeVisible();

    // First order remains untouched.
    void first;
  });
});
