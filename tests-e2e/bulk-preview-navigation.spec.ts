import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Follow-up to PR #39 — the bulk preview modal now navigates per-invoice
 * (Prev/Next buttons + ←/→ keyboard). Three scenarios:
 *   1. Forward nav + Send from position 2 → all 3 sent
 *   2. Keyboard ← / → nav works
 *   3. Arrows disabled at bounds (index 0 and last)
 *
 * Desktop-1440 only — not a responsive layout change; modal controls
 * are the same across viewports.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "E2E-NAV-";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function seedOverdueInvoices(n: number): Promise<string[]> {
  // Pick a branch that has a branch_manager (otherwise the preview
  // refuses with "No branch managers configured"). AMS always does in
  // the demo seed.
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("branch_code", "AMS")
    .single();
  const now = new Date();
  const dueAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const issuedAt = new Date(
    now.getTime() - 60 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const number = `${FIXTURE_PREFIX}${Date.now()}-${i}`;
    const { data } = await admin
      .from("invoices")
      .insert({
        invoice_number: number,
        branch_id: branch!.id,
        status: "overdue",
        issued_at: issuedAt,
        due_at: dueAt,
        total_net_cents: 10_000 + i * 1_000,
        total_vat_cents: 2_100 + i * 210,
        total_gross_cents: 12_100 + i * 1_210,
      })
      .select("id")
      .single();
    ids.push(data!.id);
  }
  return ids;
}

async function cleanup() {
  const { data: invs } = await admin
    .from("invoices")
    .select("id")
    .like("invoice_number", `${FIXTURE_PREFIX}%`);
  const ids = (invs ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "invoice")
    .in("entity_id", ids);
  await admin.from("invoices").delete().in("id", ids);
}

async function ensureSkipPreviewOff() {
  const { data: u } = await admin
    .from("users")
    .select("id, notification_preferences")
    .eq("email", "super@example.nl")
    .single();
  const prefs =
    (u?.notification_preferences as Record<string, unknown>) ?? {};
  if (prefs.skip_email_preview) {
    await admin
      .from("users")
      .update({
        notification_preferences: { ...prefs, skip_email_preview: false },
      })
      .eq("id", u!.id);
  }
}

test.beforeEach(async () => {
  await cleanup();
  await ensureSkipPreviewOff();
});
test.afterAll(cleanup);

test.describe("Bulk preview navigation (desktop-1440)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "modal navigation is not responsive-layout sensitive",
    );
  });

  test("forward + backward nav via buttons; Send from position 2 sends all 3", async ({
    page,
  }) => {
    const seeded = await seedOverdueInvoices(3);
    await signIn(page, "super@example.nl");
    await page.goto("/invoices?status=overdue");

    // Select exactly our 3 fixtures so the test is isolated from other
    // overdue invoices in the demo seed.
    for (const id of seeded) {
      const row = page.locator(`tr:has(a[href="/invoices/${id}"])`);
      await row.locator('input[type="checkbox"]').first().check();
    }
    await page.getByTestId("bulk-send-reminder").click();

    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Counter starts at 1 of 3.
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 1 of 3/,
    );

    // Prev disabled at start; Next enabled.
    await expect(modal.getByTestId("preview-prev")).toBeDisabled();
    await expect(modal.getByTestId("preview-next")).toBeEnabled();

    // Capture the first subject, then navigate forward and expect it
    // to change (each fixture has a different invoice_number → subject).
    const firstSubject = await modal
      .getByTestId("preview-subject")
      .innerText();
    await modal.getByTestId("preview-next").click();
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 2 of 3/,
    );
    const secondSubject = await modal
      .getByTestId("preview-subject")
      .innerText();
    expect(secondSubject).not.toBe(firstSubject);

    // Step to 3, verify Next disabled at end.
    await modal.getByTestId("preview-next").click();
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 3 of 3/,
    );
    await expect(modal.getByTestId("preview-next")).toBeDisabled();
    await expect(modal.getByTestId("preview-prev")).toBeEnabled();

    // Step back to 2 (still shows the same subject as before at idx 1).
    await modal.getByTestId("preview-prev").click();
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 2 of 3/,
    );
    await expect(
      modal.getByTestId("preview-subject"),
    ).toHaveText(secondSubject);

    // Sending from position 2 sends to all 3. Count audit rows before/after.
    const { count: before } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "invoice_reminder_manual")
      .in("entity_id", seeded);
    await modal.getByTestId("preview-send").click();
    await expect(
      page.getByTestId("email-preview-modal"),
    ).toHaveCount(0, { timeout: 15_000 });

    const { count: after } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "invoice_reminder_manual")
      .in("entity_id", seeded);
    // 3 new audit rows, one per seeded invoice.
    expect((after ?? 0) - (before ?? 0)).toBe(3);
  });

  test("keyboard ←/→ navigates between invoices", async ({ page }) => {
    const seeded = await seedOverdueInvoices(3);
    await signIn(page, "super@example.nl");
    await page.goto("/invoices?status=overdue");

    for (const id of seeded) {
      const row = page.locator(`tr:has(a[href="/invoices/${id}"])`);
      await row.locator('input[type="checkbox"]').first().check();
    }
    await page.getByTestId("bulk-send-reminder").click();

    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 1 of 3/,
    );

    // Right arrow → advance. Click the counter (in the header, outside
    // the iframe) so focus stays in the parent window — clicking the
    // modal body would land on the iframe and its window would swallow
    // keydown events.
    await modal.getByTestId("preview-counter").click();
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 2 of 3/,
    );
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 3 of 3/,
    );
    // Further ArrowRight clamps at the last index.
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 3 of 3/,
    );

    // Left arrow goes back.
    await page.keyboard.press("ArrowLeft");
    await expect(modal.getByTestId("preview-counter")).toHaveText(
      /Preview 2 of 3/,
    );
    // Close without sending — cleanup covers the fixtures.
    await modal.getByRole("button", { name: "Cancel" }).click();
  });

  test("single-invoice preview has no counter or nav buttons", async ({
    page,
  }) => {
    // Use the existing invoice detail "Send reminder" path which opens
    // a single-invoice preview (no bulk).
    const { data: existing } = await admin
      .from("invoices")
      .select("id")
      .eq("status", "overdue")
      .is("deleted_at", null)
      .limit(1)
      .single();
    await signIn(page, "super@example.nl");
    await page.goto(`/invoices/${existing!.id}`);
    await page.getByTestId("invoice-send-reminder-button").click();
    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    // No counter, no Prev/Next.
    await expect(modal.getByTestId("preview-counter")).toHaveCount(0);
    await expect(modal.getByTestId("preview-prev")).toHaveCount(0);
    await expect(modal.getByTestId("preview-next")).toHaveCount(0);
    await modal.getByRole("button", { name: "Cancel" }).click();
  });
});
