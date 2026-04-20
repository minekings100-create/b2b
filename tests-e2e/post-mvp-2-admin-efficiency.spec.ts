import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Post-MVP Sprint 2 — admin efficiency tools.
 *
 *   1. Bulk reminder action bar on /invoices?status=overdue
 *   2. Email preview modal (single + bulk) on invoice actions
 *
 * Test discipline per CLAUDE.md: preview modal is a new responsive
 * UI surface (iframe + stacked controls) → runs 3-viewport. The
 * access + audit-trail assertions run desktop-1440 only.
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

async function firstOverdueInvoice(): Promise<{ id: string; number: string }> {
  const { data } = await admin
    .from("invoices")
    .select("id, invoice_number")
    .eq("status", "overdue")
    .is("deleted_at", null)
    .limit(1)
    .single();
  return { id: data!.id, number: data!.invoice_number };
}

async function restoreSkipPreviewPreference(): Promise<void> {
  // Ensure super@example.nl starts each run with the skip flag off so
  // preview-modal tests can rely on the modal opening.
  const { data: u } = await admin
    .from("users")
    .select("id, notification_preferences")
    .eq("email", "super@example.nl")
    .single();
  const prefs =
    (u?.notification_preferences as Record<string, unknown>) ?? {};
  if (prefs.skip_email_preview) {
    const next = { ...prefs, skip_email_preview: false };
    await admin
      .from("users")
      .update({ notification_preferences: next })
      .eq("id", u!.id);
  }
}

test.beforeEach(restoreSkipPreviewPreference);

// ---------- 3-viewport: preview modal ------------------------------------

test.describe("Sprint 2 — email preview modal (responsive)", () => {
  test("single invoice reminder opens preview, iframe + plaintext toggle", async ({
    page,
  }) => {
    const inv = await firstOverdueInvoice();
    await signIn(page, "super@example.nl");
    await page.goto(`/invoices/${inv.id}`);
    await page
      .getByTestId("invoice-send-reminder-button")
      .click();
    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Recipients + subject visible.
    await expect(modal.getByTestId("preview-recipients")).toBeVisible();
    await expect(modal.getByTestId("preview-subject")).toContainText(
      /overdue/i,
    );

    // HTML iframe rendered by default.
    await expect(modal.getByTestId("preview-html")).toBeVisible();
    // Flip to plain text.
    await modal.getByRole("button", { name: "Plain text" }).click();
    await expect(modal.getByTestId("preview-plain")).toBeVisible();
    await expect(modal.getByTestId("preview-html")).toHaveCount(0);

    // Cancel closes the modal.
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("email-preview-modal")).toHaveCount(0);
  });

  test("bulk action bar + preview modal on /invoices?status=overdue", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/invoices?status=overdue");
    const selectAll = page.getByTestId("invoices-select-all");
    await expect(selectAll).toBeVisible();
    await selectAll.click();

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible();
    const count = await page
      .getByTestId("bulk-count")
      .innerText();
    expect(count).toMatch(/\d+ selected/);

    await page.getByTestId("bulk-send-reminder").click();
    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    // Bulk copy mentions "applies to N of M".
    await expect(modal).toContainText(/Applies to/i);
    await modal.getByRole("button", { name: "Cancel" }).click();
  });
});

// ---------- Desktop-1440: access + send + audit ---------------------------

test.describe("Sprint 2 — access, send, audit (desktop-1440)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "non-responsive: access / send / audit checks",
    );
  });

  test("branch user sees no checkboxes on overdue list", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/invoices?status=overdue");
    await expect(page.getByTestId("invoices-select-all")).toHaveCount(0);
  });

  test("admin sending bulk reminder writes invoice_reminder_manual audit rows", async ({
    page,
  }) => {
    // Use head:true + destructure `count` (not `data` — head mode returns
    // null in `data`). Counts rows matching the action filter.
    const { count: beforeCount } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "invoice_reminder_manual");
    const before = beforeCount ?? 0;

    await signIn(page, "super@example.nl");
    await page.goto("/invoices?status=overdue");
    await page.getByTestId("invoices-select-all").click();
    await page.getByTestId("bulk-send-reminder").click();
    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByTestId("preview-send").click();
    // After success the modal closes itself after a short beat.
    await expect(
      page.getByTestId("email-preview-modal"),
    ).toHaveCount(0, { timeout: 10_000 });

    // At least one new `invoice_reminder_manual` audit row exists.
    const { count: afterCount } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "invoice_reminder_manual");
    const after = afterCount ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  test("skip-preview toggle persists across sessions", async ({ page }) => {
    const inv = await firstOverdueInvoice();
    await signIn(page, "super@example.nl");
    await page.goto(`/invoices/${inv.id}`);
    await page.getByTestId("invoice-send-reminder-button").click();
    const modal = page.getByTestId("email-preview-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByTestId("preview-skip-next").check();
    await modal.getByTestId("preview-send").click();

    // DB side: notification_preferences.skip_email_preview is true.
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("users")
          .select("notification_preferences")
          .eq("email", "super@example.nl")
          .single();
        const prefs = (data?.notification_preferences ?? {}) as Record<
          string,
          unknown
        >;
        return prefs.skip_email_preview === true;
      })
      .toBe(true);

    // Reload the page — next "Send reminder" click should NOT open
    // the modal (skip preference in effect).
    await page.goto(`/invoices/${inv.id}`);
    await page.getByTestId("invoice-send-reminder-button").click();
    // Give a beat to confirm the modal did not open.
    await page.waitForTimeout(800);
    await expect(page.getByTestId("email-preview-modal")).toHaveCount(0);
  });
});
