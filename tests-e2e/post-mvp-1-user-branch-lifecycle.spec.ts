import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Post-MVP Sprint 1 — user + branch lifecycle + admin password reset.
 *
 * Test discipline per CLAUDE.md: the invite form + detail pages + branch
 * create/edit forms are new responsive UI → these tests run 3-viewport.
 * Access/redirect checks run desktop-1440 only (non-responsive).
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "e2e-postmvp1-";
const FIXTURE_BRANCH_CODE_PREFIX = "EMV1";

async function signIn(page: Page, email: string, password = "demo-demo-1") {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function cleanup() {
  const { data: authList } = await admin.auth.admin.listUsers();
  for (const u of authList?.users ?? []) {
    if (u.email?.startsWith(FIXTURE_PREFIX)) {
      await admin
        .from("audit_log")
        .delete()
        .eq("entity_type", "user")
        .eq("entity_id", u.id);
      await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
    }
  }
  const { data: branches } = await admin
    .from("branches")
    .select("id")
    .like("branch_code", `${FIXTURE_BRANCH_CODE_PREFIX}%`);
  const ids = (branches ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await admin
      .from("audit_log")
      .delete()
      .eq("entity_type", "branch")
      .in("entity_id", ids);
    await admin.from("branches").delete().in("id", ids);
  }
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

// ---------- 3-viewport: branch create/edit + invite-form rendering --------

test.describe("Sprint 1 — invite form renders responsively", () => {
  // Renders the invite form across all 3 viewports without exercising the
  // rate-limited `inviteUserByEmail` call. Submit-side behaviour is
  // covered by the desktop-only "admin invites..." test below, run once
  // per session to stay under Supabase's 3/hour email rate cap.
  test("invite form layout + role-assignment row renders", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/users/new");
    await expect(
      page.getByRole("heading", { name: "Invite user" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.locator('select[name="assignments_role"]').first()).toBeVisible();
    await expect(page.getByTestId("add-role-row")).toBeVisible();
    await expect(page.getByTestId("invite-submit")).toBeVisible();
  });

  test("branch create + edit round-trip with audit rows", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/branches");
    await page.getByTestId("create-branch-button").click();

    const code = `${FIXTURE_BRANCH_CODE_PREFIX}${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Name").fill("E2E Sprint 1 Branch");
    await page.getByLabel("Branch code").fill(code);
    await page.getByLabel("Payment term (days)").fill("30");
    await page.getByTestId("branch-submit").click();

    await page.waitForURL(/\/branches\/[0-9a-f-]+/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "E2E Sprint 1 Branch" }),
    ).toBeVisible();

    // Edit: change name.
    await page.getByLabel("Name").fill("E2E Sprint 1 Branch — renamed");
    await page.getByTestId("branch-submit").click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("branches")
          .select("name")
          .eq("branch_code", code)
          .single();
        return data?.name;
      })
      .toBe("E2E Sprint 1 Branch — renamed");

    // Audit rows.
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("branch_code", code)
      .single();
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "branch")
      .eq("entity_id", branch!.id);
    const actions = (audit ?? []).map((a) => a.action);
    expect(actions).toContain("branch_created");
    expect(actions).toContain("branch_updated");
  });
});

// ---------- Desktop-only — access control + edge cases --------------------

test.describe("Sprint 1 — access + edge cases (desktop-1440)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "access/edge tests are not responsive-sensitive",
    );
  });

  test("admin invites a branch_user end-to-end (audit + detail redirect)", async ({
    page,
  }) => {
    // Gated by PHASE8_INVITE_SMOKE=1 because `inviteUserByEmail` is
    // rate-capped at 3/hour on Supabase's default email pipeline. Every
    // run sends a real email, so repeated local iteration and
    // back-to-back CI runs blow through the cap and surface as
    // "Invite failed: email rate limit exceeded". Flip the flag when
    // verifying end-to-end in a fresh hour window; leave off by
    // default.
    //
    // The rendering test above covers the UI layout on every viewport,
    // and the "duplicate-email" test below exercises the action's
    // pre-check path (which short-circuits before sending). Together
    // they cover everything except the live email send.
    if (process.env.PHASE8_INVITE_SMOKE !== "1") {
      test.skip(
        true,
        "PHASE8_INVITE_SMOKE!=1 — skipping to stay under Supabase's 3 emails/hour cap",
      );
      return;
    }
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/users");
    await page.getByTestId("invite-user-button").click();

    const email = `${FIXTURE_PREFIX}user-${Date.now()}@example.nl`;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Full name").fill("Post-MVP Test User");
    await page.getByTestId("invite-submit").click();

    await page.waitForURL(/\/users\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Post-MVP Test User" }),
    ).toBeVisible();

    const { data: invited } = await admin.auth.admin.listUsers();
    const created = invited?.users.find((u) => u.email === email);
    expect(created).toBeTruthy();
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "user")
      .eq("entity_id", created!.id)
      .eq("action", "user_invited");
    expect(audit?.length).toBeGreaterThan(0);
  });

  test("non-admin redirected away from /users/new and /branches/new", async ({
    page,
  }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/users/new");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/branches/new");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("duplicate-email invite surfaces the friendly error", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/users/new");
    // super@example.nl already exists — try to invite it again.
    await page.getByLabel("Email").fill("super@example.nl");
    await page.getByLabel("Full name").fill("Dup");
    await page.getByTestId("invite-submit").click();
    await expect(
      page.getByText(/already exists. Assign roles/i),
    ).toBeVisible();
  });

  test("admin (non-super) cannot grant super_admin via invite form", async ({
    page,
  }) => {
    // Pick an admin fixture from seed — look up one "administration"
    // user. If none in this env, skip.
    const { data } = await admin
      .from("user_branch_roles")
      .select("users!inner(email)")
      .eq("role", "administration")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const adminEmail = (
      data as unknown as { users: { email: string } } | null
    )?.users?.email;
    if (!adminEmail) {
      test.skip(true, "no administration-role user in the seed");
      return;
    }
    await signIn(page, adminEmail);
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto("/users/new");
    // The first role select should not include super_admin in its options.
    const roleSelect = page.locator('select[name="assignments_role"]').first();
    const optionTexts = await roleSelect
      .locator("option")
      .allInnerTexts();
    expect(optionTexts).not.toContain("super_admin");
  });

  test("admin disables + re-enables another user's login", async ({ page }) => {
    // Seed a target user we can flip.
    const email = `${FIXTURE_PREFIX}victim-${Date.now()}@example.nl`;
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: "demo-demo-1",
      email_confirm: true,
    });
    const victimId = created!.user!.id;

    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto(`/users/${victimId}`);

    // Disable.
    await page
      .getByRole("button", { name: `Disable login for ${email}` })
      .click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("users")
          .select("login_disabled")
          .eq("id", victimId)
          .single();
        return data?.login_disabled;
      })
      .toBe(true);

    // Re-enable.
    await page
      .getByRole("button", { name: `Re-enable login for ${email}` })
      .click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("users")
          .select("login_disabled")
          .eq("id", victimId)
          .single();
        return data?.login_disabled;
      })
      .toBe(false);

    // Audit trail.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "user")
      .eq("entity_id", victimId);
    const actions = (audit ?? []).map((a) => a.action);
    expect(actions).toContain("user_deactivated");
    expect(actions).toContain("user_reactivated");
  });

  test("deactivated user sees 'account deactivated' on login", async ({
    page,
  }) => {
    const email = `${FIXTURE_PREFIX}deact-${Date.now()}@example.nl`;
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: "demo-demo-1",
      email_confirm: true,
    });
    const id = created!.user!.id;
    await admin.from("users").update({ login_disabled: true }).eq("id", id);

    await page.goto("/login");
    await page.getByLabel("Email").first().fill(email);
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText(/This account is deactivated/i),
    ).toBeVisible({ timeout: 10_000 });
    // Still on /login (not redirected).
    await expect(page).toHaveURL(/\/login/);
  });

  test("cannot deactivate your own login", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    const { data: me } = await admin
      .from("users")
      .select("id")
      .eq("email", "super@example.nl")
      .single();
    await page.goto(`/users/${me!.id}`);
    // The toggle is replaced with the "you can't disable your own login"
    // copy — no "Disable login" button.
    await expect(
      page.getByText(/You can't disable your own login/i),
    ).toBeVisible();
  });

  test("last-super-admin guard blocks deactivate when only one active super_admin", async ({
    page,
  }) => {
    // Count active super_admins.
    const { data: rows } = await admin
      .from("user_branch_roles")
      .select("user_id, users!inner(login_disabled, deleted_at)")
      .eq("role", "super_admin")
      .is("deleted_at", null);
    type Row = {
      user_id: string;
      users: { login_disabled: boolean; deleted_at: string | null };
    };
    const activeSuperAdmins = Array.from(
      new Set(
        ((rows ?? []) as unknown as Row[])
          .filter(
            (r) =>
              r.users.deleted_at === null && r.users.login_disabled === false,
          )
          .map((r) => r.user_id),
      ),
    );

    if (activeSuperAdmins.length !== 1) {
      test.skip(
        true,
        `env has ${activeSuperAdmins.length} active super_admins; need exactly 1 for this scenario`,
      );
      return;
    }
    const soleId = activeSuperAdmins[0]!;

    // Administration users can delete super_admin rows (action allows it
    // with isSuperAdmin gate), but a super_admin deactivating themselves
    // is already blocked by the self-check. Need a DIFFERENT super_admin
    // account to try — which by definition we don't have if count is 1.
    // Instead, exercise via the `removeRole` action: go to the sole
    // super_admin's detail page (as that same super_admin — since it's
    // the only one) and try to remove their super_admin role. The
    // guard should trip.
    await signIn(page, "super@example.nl");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await page.goto(`/users/${soleId}`);

    // Find the super_admin assignment row and click its "Remove" icon.
    const superAdminRow = page
      .locator("li", { hasText: /^super_admin/ })
      .first();
    await superAdminRow
      .getByRole("button", { name: /Remove super_admin/ })
      .click();
    await expect(
      page.getByText(/leave the system with zero super admins/i),
    ).toBeVisible({ timeout: 5_000 });
  });
});
