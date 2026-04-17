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

async function userId(email: string): Promise<string | null> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id ?? null;
}

async function wipeNonSeedOrders(uid: string) {
  // Hard-delete everything created by this user except DEMO-* (seeded).
  const { data: mine } = await admin
    .from("orders")
    .select("id, order_number")
    .eq("created_by_user_id", uid);
  const ids = (mine ?? [])
    .filter((o) => !o.order_number.startsWith("DEMO-"))
    .map((o) => o.id);
  if (ids.length === 0) return;
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "order")
    .in("entity_id", ids);
  await admin.from("orders").delete().in("id", ids);
}

const TEST_EMAIL = "utr.user1@example.nl";

test.beforeEach(async () => {
  const uid = await userId(TEST_EMAIL);
  if (uid) await wipeNonSeedOrders(uid);
});

test.afterAll(async () => {
  const uid = await userId(TEST_EMAIL);
  if (uid) await wipeNonSeedOrders(uid);
});

test.describe("Phase 3.1 cart + submit", () => {
  test("add → edit → submit (blocked → CONFIRM override → submitted)", async ({
    page,
  }) => {
    await signIn(page, TEST_EMAIL);
    const uid = (await userId(TEST_EMAIL))!;

    // --- Add from catalog detail drawer --------------------------------
    await page.goto("/catalog");
    await page.locator("tbody tr a").first().click();
    await page.waitForURL(/pid=/);
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Quantity", { exact: true }).fill("3");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(drawer.getByText(/Added —/)).toBeVisible({ timeout: 10_000 });

    // --- Edit in /cart -------------------------------------------------
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    const qty = page.locator('input[type="number"]').first();
    await expect(qty).toHaveValue("3");
    await qty.fill("5");
    await page.getByRole("button", { name: "Update quantity" }).click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("order_items")
            .select("quantity_requested, orders!inner(status, created_by_user_id)")
            .eq("orders.created_by_user_id", uid)
            .eq("orders.status", "draft");
          const rows = data as unknown as
            | { quantity_requested: number }[]
            | undefined;
          return rows?.[0]?.quantity_requested ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe(5);

    // --- Submit hits the outstanding-invoice block on any seeded branch ---
    await page.getByRole("button", { name: "Submit order" }).click();

    await page.waitForURL(/block=outstanding/, { timeout: 15_000 });
    await expect(page.getByText(/overdue invoice/i)).toBeVisible();

    const submitAnyway = page.getByRole("button", { name: "Submit anyway" });
    await expect(submitAnyway).toBeDisabled();
    await page.getByLabel("Confirmation phrase").fill("CONFIRM");
    await expect(submitAnyway).toBeEnabled();
    await submitAnyway.click();

    await page.waitForURL("**/orders", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

    // Order row in DB: submitted, real ORD-YYYY-NNNN number.
    const { data: orderRow } = await admin
      .from("orders")
      .select("id, status, order_number")
      .eq("created_by_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(orderRow?.status).toBe("submitted");
    expect(orderRow?.order_number).toMatch(/^ORD-\d{4}-\d+$/);

    // Audit trail includes cart_add, cart_update_qty, submit.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "order")
      .eq("entity_id", orderRow!.id);
    const actions = (audit ?? []).map((a) => a.action);
    expect(actions).toContain("cart_add");
    expect(actions).toContain("cart_update_qty");
    expect(actions).toContain("submit");
  });

  test("lowercase 'confirm' still enables Submit anyway (input normalises)", async ({
    page,
  }) => {
    await signIn(page, TEST_EMAIL);
    const uid = (await userId(TEST_EMAIL))!;

    await page.goto("/catalog");
    await page.locator("tbody tr a").first().click();
    await page.waitForURL(/pid=/);
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Quantity", { exact: true }).fill("1");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(drawer.getByText(/Added —/)).toBeVisible({ timeout: 10_000 });

    await page.goto("/cart");
    await page.getByRole("button", { name: "Submit order" }).click();
    await page.waitForURL(/block=outstanding/, { timeout: 15_000 });

    // Type *lowercase* — the input's onChange must uppercase it so the
    // state matches the CSS text-transform; button must enable.
    const input = page.getByLabel("Confirmation phrase");
    await input.fill("confirm");
    // React's controlled-input normalisation writes "CONFIRM" back.
    await expect(input).toHaveValue("CONFIRM");

    const submitAnyway = page.getByRole("button", { name: "Submit anyway" });
    await expect(submitAnyway).toBeEnabled();
    await submitAnyway.click();

    await page.waitForURL("**/orders", { timeout: 15_000 });

    // Audit payload records the override.
    const { data: orderRow } = await admin
      .from("orders")
      .select("id, status")
      .eq("created_by_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(orderRow?.status).toBe("submitted");

    const { data: audit } = await admin
      .from("audit_log")
      .select("after_json")
      .eq("entity_type", "order")
      .eq("entity_id", orderRow!.id)
      .eq("action", "submit")
      .single();
    const payload = audit?.after_json as
      | { override_outstanding?: boolean }
      | null;
    expect(payload?.override_outstanding).toBe(true);
  });

  test("line total updates optimistically as the user types", async ({
    page,
  }) => {
    await signIn(page, TEST_EMAIL);

    await page.goto("/catalog");
    await page.locator("tbody tr a").first().click();
    await page.waitForURL(/pid=/);
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Quantity", { exact: true }).fill("2");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(drawer.getByText(/Added —/)).toBeVisible({ timeout: 10_000 });

    await page.goto("/cart");

    // Capture the unit price shown in the "Price" cell of the only row.
    const priceCellText = (
      await page
        .locator("tbody tr")
        .first()
        .locator("td")
        .nth(3)
        .innerText()
    ).trim();
    const unitPrice = Number.parseFloat(
      priceCellText.replace(/[^\d,.-]/g, "").replace(",", "."),
    );
    expect(Number.isFinite(unitPrice)).toBe(true);

    // Starting line total = 2 × unit price.
    const qtyInput = page.locator('input[type="number"]').first();
    await expect(qtyInput).toHaveValue("2");

    // Type a new qty but *don't* click Save — line total should update anyway.
    await qtyInput.fill("7");
    const expectedTotalStr = (7 * unitPrice).toFixed(2).replace(".", ",");
    const lineCell = page.locator("tbody tr").first().locator("td").nth(6);
    await expect(lineCell).toContainText(expectedTotalStr);
  });

  test("remove a cart line clears the cart", async ({ page }) => {
    await signIn(page, TEST_EMAIL);

    await page.goto("/catalog");
    await page.locator("tbody tr a").first().click();
    await page.waitForURL(/pid=/);
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Quantity", { exact: true }).fill("1");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(drawer.getByText(/Added —/)).toBeVisible({ timeout: 10_000 });

    await page.goto("/cart");
    await page.getByRole("button", { name: /Remove .+/ }).first().click();
    await expect(page.getByText("Your cart is empty")).toBeVisible({
      timeout: 10_000,
    });
  });
});
