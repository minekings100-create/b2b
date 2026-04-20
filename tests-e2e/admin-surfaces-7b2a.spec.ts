import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 7b-2a — admin surfaces (holidays + audit log).
 *
 * Two pages under test:
 *   /admin/holidays   — super_admin only. CRUD against public_holidays.
 *   /admin/audit-log  — admin (super_admin + administration). Filters
 *                        + pagination over audit_log.
 *
 * Test discipline: both pages are route-level tables; no responsive
 * layout touched. Desktop-1440 only per CLAUDE.md.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_NAME_PREFIX = "E2E-7B2A-";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function cleanupHolidayFixtures() {
  const { data: rows } = await admin
    .from("public_holidays")
    .select("id")
    .like("name", `${FIXTURE_NAME_PREFIX}%`);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await admin
      .from("audit_log")
      .delete()
      .eq("entity_type", "public_holiday")
      .in("entity_id", ids);
    await admin.from("public_holidays").delete().in("id", ids);
  }
}

test.beforeEach(cleanupHolidayFixtures);
test.afterAll(cleanupHolidayFixtures);

test.describe("7b-2a /admin/holidays", () => {
  test("non-super_admin is redirected to /dashboard", async ({ page }) => {
    // administration is admin but NOT super_admin — must be bounced.
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/admin/holidays");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("super_admin sees the seed list grouped by year", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/admin/holidays");
    await expect(
      page.getByRole("heading", { name: "Public holidays" }),
    ).toBeVisible();
    // 7b-1 seeded 2026 + 2027 — both year sections must render.
    await expect(page.getByRole("heading", { level: 2, name: /^2026/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^2027/ })).toBeVisible();
    // And at least one recognisable seed row should be visible.
    await expect(page.getByText("Koningsdag").first()).toBeVisible();
  });

  test("super_admin can add, edit, delete a holiday + audit rows are written", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/admin/holidays");

    // --- Add ---
    const fixtureName = `${FIXTURE_NAME_PREFIX}TestDay`;
    const fixtureDate = "2028-06-15"; // outside the 2026/2027 seed to avoid collision
    await page.getByLabel("Date").fill(fixtureDate);
    await page.getByLabel("Name").fill(fixtureName);
    await page.getByRole("button", { name: "Add holiday" }).click();

    // Wait for the year section + row to appear.
    await expect(page.getByRole("heading", { level: 2, name: /^2028/ })).toBeVisible();
    await expect(page.getByText(fixtureName).first()).toBeVisible();

    // Audit row was written.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, after_json")
      .eq("entity_type", "public_holiday")
      .eq("action", "holiday_created")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit?.[0]?.action).toBe("holiday_created");
    const after = audit?.[0]?.after_json as { name?: string } | null;
    expect(after?.name).toBe(fixtureName);

    // --- Edit ---
    const row = page.locator("tr", { hasText: fixtureName }).first();
    await row.getByRole("button", { name: `Edit ${fixtureName}` }).click();
    const editedName = `${fixtureName}-renamed`;
    const editRow = page.locator("tr", { has: page.getByLabel("Name") }).first();
    await editRow.getByLabel("Name").fill(editedName);
    await editRow.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(editedName).first()).toBeVisible();

    // --- Delete ---
    const rowAfterEdit = page.locator("tr", { hasText: editedName }).first();
    await rowAfterEdit
      .getByRole("button", { name: `Delete ${editedName}` })
      .click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(editedName)).toHaveCount(0);
  });

  test("duplicate (region, date) shows a friendly error", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/admin/holidays");

    // Try to add Koningsdag 2026 — already in the seed.
    await page.getByLabel("Date").fill("2026-04-27");
    await page.getByLabel("Name").fill(`${FIXTURE_NAME_PREFIX}Duplicate`);
    await page.getByRole("button", { name: "Add holiday" }).click();
    // Scope to the form's error paragraph — Next.js also renders a
    // separate route-announcer div with role=alert.
    await expect(
      page.locator('p[role="alert"]'),
    ).toContainText(/already exists/i);
  });
});

test.describe("7b-2a /admin/audit-log", () => {
  test("non-admin is redirected", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/admin/audit-log");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("admin sees recent audit rows and can filter by entity_type", async ({
    page,
  }) => {
    // Seed one deterministic audit row we can filter for.
    const seedId = crypto.randomUUID();
    await admin.from("audit_log").insert({
      entity_type: "test_e2e_7b2a",
      entity_id: seedId,
      action: "e2e_probe",
      actor_user_id: null,
      before_json: null,
      after_json: { marker: FIXTURE_NAME_PREFIX },
    });

    try {
      await signIn(page, "super@example.nl");
      await page.goto("/admin/audit-log?entity_type=test_e2e_7b2a");
      await expect(
        page.getByRole("heading", { name: "Audit log" }),
      ).toBeVisible();
      // Our seeded row shows up.
      await expect(page.getByText("e2e_probe").first()).toBeVisible();
      await expect(page.getByText(seedId).first()).toBeVisible();

      // Reset link goes back to the unfiltered view.
      await page.getByRole("link", { name: "Reset" }).click();
      await expect(page).toHaveURL(/\/admin\/audit-log$/);
    } finally {
      await admin
        .from("audit_log")
        .delete()
        .eq("entity_type", "test_e2e_7b2a")
        .eq("entity_id", seedId);
    }
  });

  test("filtering by an unknown actor email shows a helpful empty state", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    await page.goto(
      "/admin/audit-log?actor_email=nobody@does-not-exist.example",
    );
    await expect(
      page.getByText(/No user with email/i),
    ).toBeVisible();
  });
});

test.describe("7b-2a sidebar visibility", () => {
  test("super_admin sees both Audit log AND Holidays links", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Holidays" })).toBeVisible();
  });

  test("administration sees Audit log but NOT Holidays (super_admin only)", async ({
    page,
  }) => {
    // hq.ops is hq_operations_manager — NOT admin. Use a branch manager
    // who's also admin... actually we need a pure `administration` role
    // seeded. Skip this one if the seed doesn't have it; otherwise
    // assert the split.
    const { data: administrationUsers } = await admin
      .from("user_branch_roles")
      .select("user_id, users!inner(email)")
      .eq("role", "administration")
      .limit(1);
    const firstAdmin = (administrationUsers?.[0] as unknown as {
      users: { email: string };
    } | undefined)?.users.email;
    if (!firstAdmin) {
      test.skip(true, "No administration-role user in the seed");
      return;
    }
    await signIn(page, firstAdmin);
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Holidays" })).toHaveCount(0);
  });

  test("branch user sees neither", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Holidays" })).toHaveCount(0);
  });
});
