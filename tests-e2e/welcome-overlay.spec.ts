import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Post-MVP Sprint 3 — first-login welcome overlay. Covers:
 *   1. Overlay renders for a user whose `welcome_dismissed_at` is null.
 *   2. Role-based title differs between super_admin and a branch_user.
 *   3. Clicking "Got it" dismisses + stamps welcome_dismissed_at.
 *   4. Overlay does not re-appear on next navigation.
 *
 * Runs at 3 viewports — the overlay stretches full-width on mobile
 * (bottom sheet) and collapses to a bottom-right card on desktop, so
 * responsive layout is explicitly in scope.
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

async function resetWelcome(email: string) {
  const { data: u } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  if (!u) return;
  await admin
    .from("users")
    .update({ welcome_dismissed_at: null })
    .eq("id", u.id);
}

test.describe("Sprint 3 — welcome overlay", () => {
  test.beforeEach(async () => {
    // Reset both accounts we'll touch so each test starts from "not yet
    // dismissed". The overlay is one-shot so we have to clear it.
    await Promise.all([
      resetWelcome("super@example.nl"),
      resetWelcome("ams.user1@example.nl"),
    ]);
  });

  test("super admin sees the 'super admin' welcome title", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    const overlay = page.getByTestId("welcome-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toContainText(/super admin/i);
  });

  test("branch user sees the branch-user welcome copy", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    const overlay = page.getByTestId("welcome-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    // "Welcome to Bessems Procurement" is the branch_user title.
    await expect(overlay).toContainText(/Bessems/i);
    await expect(overlay).toContainText(/catalog/i);
  });

  test("clicking 'Got it' dismisses + persists so it doesn't return on nav", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    const overlay = page.getByTestId("welcome-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await overlay.getByTestId("welcome-dismiss").click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    // The dismissal runs in a React transition — the button click
    // returns before the server action lands. Poll the DB so we don't
    // race the next navigation against an in-flight write.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("users")
            .select("welcome_dismissed_at")
            .eq("email", "super@example.nl")
            .single();
          return data?.welcome_dismissed_at != null;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // Overlay should not re-appear on a fresh navigation.
    await page.goto("/catalog");
    await expect(page.getByTestId("welcome-overlay")).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("clicking the X close button also dismisses", async ({ page }) => {
    await signIn(page, "super@example.nl");
    const overlay = page.getByTestId("welcome-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await overlay.getByTestId("welcome-close").click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
  });
});

// Leave the fixtures in "dismissed" state at teardown. Other specs
// don't care about the overlay, and leaving it null would make the
// card float over the bottom-right of their viewport (e.g. covering
// modal footer buttons on centred dialogs).
async function stampDismissed(email: string) {
  const { data: u } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  if (!u) return;
  await admin
    .from("users")
    .update({ welcome_dismissed_at: new Date().toISOString() })
    .eq("id", u.id);
}

test.afterAll(async () => {
  await Promise.all([
    stampDismissed("super@example.nl"),
    stampDismissed("ams.user1@example.nl"),
  ]);
});
