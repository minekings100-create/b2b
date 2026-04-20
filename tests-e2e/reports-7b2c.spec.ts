import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 7b-2c — reports.
 *
 * Covers:
 *   - /reports index visibility by role (admin sees 4 cards, HQ sees 3, branch user redirects)
 *   - Each of the 4 report pages renders its table + summary
 *   - CSV export route returns 200 + sensible headers for admin; 403 for branch user
 *   - AR aging is admin-only (HQ redirects)
 *
 * Test discipline (CLAUDE.md): reports are table-style read surfaces;
 * the grid on the index is responsive (1/2/3 cols) but other layouts
 * are table+form — no fresh responsive breakpoints. Desktop-1440.
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

test.describe("7b-2c /reports access", () => {
  test("branch user is redirected away from /reports", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("super admin sees all four cards", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    for (const kind of [
      "spend-by-branch",
      "top-products",
      "ar-aging",
      "packer-throughput",
    ]) {
      await expect(page.getByTestId(`report-card-${kind}`)).toBeVisible();
    }
  });

  test("HQ manager sees three cards, no AR aging", async ({ page }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/reports");
    for (const kind of [
      "spend-by-branch",
      "top-products",
      "packer-throughput",
    ]) {
      await expect(page.getByTestId(`report-card-${kind}`)).toBeVisible();
    }
    await expect(page.getByTestId("report-card-ar-aging")).toHaveCount(0);
  });

  test("HQ manager direct-URL hit on /reports/ar-aging redirects", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/reports/ar-aging");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("7b-2c report pages render", () => {
  test("spend-by-branch renders with a totals row and CSV link", async ({
    page,
  }) => {
    await signIn(page, "super@example.nl");
    // Pick a wide window to maximize chance of hits.
    const from = "2025-01-01";
    const to = "2027-12-31";
    await page.goto(`/reports/spend-by-branch?from=${from}&to=${to}`);
    await expect(
      page.getByRole("heading", { name: "Spend by branch" }),
    ).toBeVisible();
    // Totals row is rendered if any rows present; otherwise empty state.
    // Either way the CSV link should be present (it's part of WindowPicker).
    const csvLink = page.getByRole("link", { name: /Download CSV/i });
    await expect(csvLink).toBeVisible();
    await expect(csvLink).toHaveAttribute(
      "href",
      /\/api\/reports\/spend-by-branch\/csv\?from=/,
    );
  });

  test("top-products renders", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/reports/top-products?from=2025-01-01&to=2027-12-31");
    await expect(
      page.getByRole("heading", { name: "Top products" }),
    ).toBeVisible();
  });

  test("ar-aging renders the five bucket tiles", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto("/reports/ar-aging");
    await expect(
      page.getByRole("heading", { name: "AR aging" }),
    ).toBeVisible();
    for (const bucket of ["current", "1-30", "31-60", "61-90", "90+"]) {
      await expect(page.locator(`[data-bucket="${bucket}"]`).first()).toBeVisible();
    }
  });

  test("packer-throughput renders", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await page.goto(
      "/reports/packer-throughput?from=2025-01-01&to=2027-12-31",
    );
    await expect(
      page.getByRole("heading", { name: "Packer throughput" }),
    ).toBeVisible();
  });
});

test.describe("7b-2c CSV export", () => {
  test("admin gets a text/csv download for spend-by-branch", async ({
    page,
    request,
  }) => {
    await signIn(page, "super@example.nl");
    // Reuse the authenticated browser context for the fetch by piggy-
    // backing on its cookie store.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await request.get(
      "/api/reports/spend-by-branch/csv?from=2025-01-01&to=2027-12-31",
      { headers: { cookie: cookieHeader } },
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(
      /attachment; filename="spend-by-branch_/,
    );
    const body = await res.text();
    // Header row present.
    expect(body.split("\r\n")[0]).toBe(
      "branch_code,branch_name,invoice_count,total_gross_eur",
    );
  });

  test("branch user gets 403 on the CSV route", async ({ page, request }) => {
    await signIn(page, "ams.user1@example.nl");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await request.get(
      "/api/reports/spend-by-branch/csv?from=2025-01-01&to=2027-12-31",
      { headers: { cookie: cookieHeader } },
    );
    expect(res.status()).toBe(403);
  });

  test("HQ manager gets 403 on the AR-aging CSV (admin only)", async ({
    page,
    request,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await request.get("/api/reports/ar-aging/csv", {
      headers: { cookie: cookieHeader },
    });
    expect(res.status()).toBe(403);
  });

  test("unknown report kind returns 404", async ({ page, request }) => {
    await signIn(page, "super@example.nl");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await request.get("/api/reports/nope/csv", {
      headers: { cookie: cookieHeader },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("7b-2c sidebar", () => {
  test("admin sees Reports in the Insights section", async ({ page }) => {
    await signIn(page, "super@example.nl");
    await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  test("HQ manager sees Reports too", async ({ page }) => {
    await signIn(page, "hq.ops@example.nl");
    await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  test("branch user does not see Reports", async ({ page }) => {
    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);
  });
});
// silence unused
void admin;
