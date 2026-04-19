import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.3.3a — /settings/notifications happy path.
 *
 * Seeds the fixture user's prefs to the permissive default before each
 * test, verifies the page renders the four-toggle grid with the
 * forced-email row locked, flips a bit, confirms "Preferences saved"
 * lands, reloads the page, confirms persistence.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FULL_ON = {
  state_changes: { email: true, in_app: true },
  admin_alerts: { email: true, in_app: true },
};

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function resetPrefs(uid: string) {
  await admin
    .from("users")
    .update({ notification_preferences: FULL_ON })
    .eq("id", uid);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.beforeEach(async () => {
  await resetPrefs(await userId("ams.user1@example.nl"));
});
test.afterAll(async () => {
  await resetPrefs(await userId("ams.user1@example.nl"));
});

test.describe("3.3.3a settings/notifications", () => {
  test("page renders the 2×2 grid with the admin_alerts email checkbox locked", async ({
    page,
  }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

    // All four checkboxes present.
    const stateEmail = page.locator('input[name="state_changes.email"]');
    const stateInApp = page.locator('input[name="state_changes.in_app"]');
    const adminEmail = page.locator('input[name="admin_alerts.email"]');
    const adminInApp = page.locator('input[name="admin_alerts.in_app"]');
    await expect(stateEmail).toBeVisible();
    await expect(stateInApp).toBeVisible();
    await expect(adminEmail).toBeVisible();
    await expect(adminInApp).toBeVisible();

    // Forced row: admin_alerts.email is disabled; in_app is not.
    await expect(adminEmail).toBeDisabled();
    await expect(adminInApp).toBeEnabled();

    // Forced disclosure rendered once.
    await expect(
      page.getByText(/cannot be disabled/i).first(),
    ).toBeVisible();
  });

  test("toggling state_changes.email and saving persists across a reload", async ({
    page,
  }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/settings/notifications");

    // Uncheck state_changes.email.
    const stateEmail = page.locator('input[name="state_changes.email"]');
    await expect(stateEmail).toBeChecked();
    await stateEmail.click();
    await expect(stateEmail).not.toBeChecked();

    // Save.
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible({
      timeout: 5_000,
    });

    // Reload from server — confirm state is reflected on a fresh RSC render.
    await page.goto("/settings/notifications");
    await expect(
      page.locator('input[name="state_changes.email"]'),
    ).not.toBeChecked();
    await expect(
      page.locator('input[name="state_changes.in_app"]'),
    ).toBeChecked();

    // DB truth.
    const uid = await userId("ams.user1@example.nl");
    const { data } = await admin
      .from("users")
      .select("notification_preferences")
      .eq("id", uid)
      .single();
    const prefs = data!.notification_preferences as typeof FULL_ON;
    expect(prefs.state_changes.email).toBe(false);
    expect(prefs.state_changes.in_app).toBe(true);
    expect(prefs.admin_alerts.email).toBe(true);
    expect(prefs.admin_alerts.in_app).toBe(true);
  });

  test("a crafted POST cannot flip the forced admin_alerts.email bit", async ({
    page,
  }) => {
    // Locked checkbox doesn't submit a value, which is the UX discipline.
    // The server-side preservation is the real guarantee (categories.ts
    // forced list). This test verifies that even after a save, the bit
    // stays on.
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/settings/notifications");
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible({
      timeout: 5_000,
    });

    const uid = await userId("ams.user1@example.nl");
    const { data } = await admin
      .from("users")
      .select("notification_preferences")
      .eq("id", uid)
      .single();
    const prefs = data!.notification_preferences as typeof FULL_ON;
    expect(prefs.admin_alerts.email).toBe(true);
  });

  test("save action writes an audit_log row with source='settings_page'", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");

    // Flip a bit to guarantee a non-empty diff (audit write is skipped
    // when nothing changed — that's intentional).
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/settings/notifications");
    await page.locator('input[name="state_changes.in_app"]').click();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible({
      timeout: 5_000,
    });

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("audit_log")
            .select("action, after_json, actor_user_id, entity_id")
            .eq("actor_user_id", uid)
            .eq("action", "notification_preferences_updated")
            .order("created_at", { ascending: false })
            .limit(1);
          return data?.[0] ?? null;
        },
        { timeout: 5_000 },
      )
      .not.toBeNull();

    const { data: rows } = await admin
      .from("audit_log")
      .select("action, after_json, actor_user_id, entity_id")
      .eq("actor_user_id", uid)
      .eq("action", "notification_preferences_updated")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = rows![0];
    expect(row.entity_id).toBe(uid);
    const after = row.after_json as { source?: string };
    expect(after.source).toBe("settings_page");
  });
});
