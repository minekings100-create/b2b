import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Regression tests for two bugs found during end-to-end testing of the
 * packer role:
 *
 *   BUG 1 — packer sidebar leaked the Invoices tab. Packers have no
 *     relationship with invoicing; the tab is now role-gated.
 *
 *   BUG 2 — opening an order as packer produced an SSR crash
 *     ("Jest worker encountered child process exceptions"). The crash
 *     did not reproduce against current seed + migrations — all five
 *     packer-visible order statuses render cleanly. The per-status
 *     spec below is kept as a durable guard so any future regression
 *     in packer-scoped SSR surfaces as a red test rather than a vague
 *     dev-server worker message.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.describe("BUG 1 — sidebar Invoices visibility", () => {
  // Dashboards (admin / BM) render stat cards with `aria-label="Invoices"`
  // too, so the assertions target the sidebar's own `<a href="/invoices">`
  // rather than a generic accessible-name match.
  const sidebarInvoices = (page: Page) =>
    page.locator("aside a[href='/invoices']").first();

  test("packer does NOT see the Invoices link", async ({ page }) => {
    await signIn(page, "packer1@example.nl");
    await expect(page.locator("aside a[href='/invoices']")).toHaveCount(0);
  });

  test("branch user still sees Invoices", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await expect(sidebarInvoices(page)).toBeVisible();
  });

  test("admin still sees Invoices", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await expect(sidebarInvoices(page)).toBeVisible();
  });
});

test.describe("BUG 2 — packer opens order detail without SSR crash", () => {
  for (const status of [
    "approved",
    "picking",
    "packed",
    "shipped",
    "delivered",
  ] as const) {
    test(`status=${status}`, async ({ page }) => {
      await signIn(page, "packer1@example.nl");
      const { data } = await admin
        .from("orders")
        .select("id, order_number")
        .eq("status", status)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!data) {
        test.skip(true, `no ${status} order in seed`);
        return;
      }
      const res = await page.goto(`/orders/${data.id}`);
      // Status 200 proves the SSR didn't crash at the framework layer
      // (the symptom reported in BUG 2 was a 500 with a jest-worker
      // stack trace).
      expect(res?.status(), `${status}: non-200 SSR response`).toBe(200);
      await expect(
        page.getByRole("heading", { name: /Order /i }),
      ).toBeVisible({ timeout: 10_000 });
      // No `<div>Application error</div>` hoisted by Next.js.
      await expect(page.locator("text=Application error")).toHaveCount(0);
    });
  }
});
