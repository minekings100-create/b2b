import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.2.2a fix — three regression guards that came out of HQ
 * visual verification on /orders:
 *
 *   1. Branch + Created By columns populated for every order row. Guard
 *      against anyone reverting the users_select_hq / current_user_has_branch
 *      policies added in 20260418000008.
 *   2. Every status filter chip is rendered (the original 3.2.1 chip set
 *      was missing branch_approved, picking, packed, rejected, cancelled).
 *   3. OrderStatusPill renders distinct hues per status — we assert the
 *      generated markup uses the right Tailwind hue class per `data-status`.
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

test.describe("3.2.2a HQ /orders visibility + chips + palette", () => {
  test("HQ Manager sees populated Branch + Created By columns", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/orders");

    // Wait until the table has at least one order row.
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Verify against the DB that the orders we expect to render exist.
    const { data: dbOrders } = await admin
      .from("orders")
      .select("id, branch_id, created_by_user_id, status")
      .is("deleted_at", null)
      .limit(1);
    expect(dbOrders?.length).toBeGreaterThan(0);

    // For every rendered row, Branch cell (index 1) and Created-by cell
    // (index 2) must be non-"—". Ten rows is plenty — cap the probe so
    // test stays fast even as demo data grows.
    const probeCount = Math.min(count, 10);
    for (let i = 0; i < probeCount; i++) {
      const row = rows.nth(i);
      const branchCell = await row.locator("td").nth(1).innerText();
      const creatorCell = await row.locator("td").nth(2).innerText();
      expect(branchCell.trim(), `branch cell empty on row ${i}`).not.toBe("—");
      expect(creatorCell.trim(), `creator cell empty on row ${i}`).not.toBe(
        "—",
      );
    }
  });

  test("filter chip groups are visually labelled (post-visual-review fix v3)", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/orders");

    const nav = page.getByRole("navigation", {
      name: "Filter orders by status",
    });

    // Each lifecycle group ships a small uppercase header so the user
    // can scan structure at a glance. Earlier iterations relied on a
    // 1px divider which was invisible in dark mode — this test catches
    // a regression to that invisible-only state.
    for (const label of ["PENDING", "FULFILLMENT", "DONE", "HALTED"]) {
      await expect(
        nav.getByText(label, { exact: true }),
      ).toBeVisible();
    }

    // Wrappers still carry data-group attrs so future tests + styling
    // can target individual groups. There are 5 (the four labelled
    // groups + the unlabelled "All" reset).
    const groups = nav.locator("[data-group]");
    await expect(groups).toHaveCount(5);
  });

  test("active filter chip carries aria-pressed='true' and the strong-active class", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");

    // Click "Branch approved" — a chip the prior iteration left visually
    // unhighlighted. Assert both ARIA state and a class signature that
    // proves it switched to the strong accent fill.
    await page.goto("/orders?status=branch_approved");

    const active = page.getByRole("link", {
      name: "Branch approved",
      exact: true,
    });
    await expect(active).toHaveAttribute("aria-pressed", "true");
    const cls = (await active.getAttribute("class")) ?? "";
    expect(cls, "active chip missing bg-accent class").toMatch(/\bbg-accent\b/);

    // Sibling chips must carry aria-pressed='false'.
    const inactive = page.getByRole("link", { name: "Submitted", exact: true });
    await expect(inactive).toHaveAttribute("aria-pressed", "false");
  });

  test("every lifecycle status has a filter chip", async ({ page }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/orders");

    const nav = page.getByRole("navigation", {
      name: "Filter orders by status",
    });
    await expect(nav).toBeVisible();

    // Assert each chip label is present. Labels come straight from
    // status-filter-chips.tsx; if that file changes the labels, update
    // both places together.
    for (const label of [
      "All",
      "Submitted",
      "Branch approved",
      "Approved",
      "Picking",
      "Packed",
      "Shipped",
      "Delivered",
      "Closed",
      "Rejected",
      "Cancelled",
    ]) {
      // `exact: true` — without it "Approved" matches both "Approved" and
      // "Branch approved" and strict-mode trips.
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test("status pills use a distinct hue per status (no two identical bg classes)", async ({
    page,
  }) => {
    await signIn(page, "hq.ops@example.nl");
    await page.goto("/orders");

    // Collect every (status, bgClass) pair from pills currently on screen.
    // Demo data covers multiple statuses; we only assert that *distinct*
    // statuses we actually see map to distinct colour hues.
    const pills = page.locator("[data-status]");
    await expect(pills.first()).toBeVisible({ timeout: 10_000 });

    const bgByStatus = new Map<string, string>();
    const n = Math.min(await pills.count(), 50);
    for (let i = 0; i < n; i++) {
      const el = pills.nth(i);
      const status = await el.getAttribute("data-status");
      const cls = (await el.getAttribute("class")) ?? "";
      // Extract the first `bg-<hue>-…` token — this is the light-mode
      // background and is the hue signature for the pill.
      const match = cls.match(/\bbg-([a-z]+)-[0-9]+/);
      if (!status || !match) continue;
      const hue = match[1]!;
      if (bgByStatus.has(status)) continue;
      bgByStatus.set(status, hue);
    }

    // The only status we allow to share a hue with another is `cancelled`
    // ↔ `rejected` (both red, muted vs saturated) and `draft` ↔ `closed`
    // (both zinc, different shades). Everything else must be a unique hue.
    const hueToStatuses = new Map<string, string[]>();
    for (const [status, hue] of bgByStatus) {
      const arr = hueToStatuses.get(hue) ?? [];
      arr.push(status);
      hueToStatuses.set(hue, arr);
    }
    for (const [hue, statuses] of hueToStatuses) {
      if (statuses.length <= 1) continue;
      const sorted = [...statuses].sort();
      const allowedPairs = [
        ["cancelled", "rejected"],
        ["closed", "draft"],
      ];
      const isAllowed = allowedPairs.some(
        (pair) => pair.length === sorted.length && pair.every((v, i) => sorted[i] === v),
      );
      expect(
        isAllowed,
        `hue ${hue} is shared by ${sorted.join(" + ")} (only cancelled/rejected and closed/draft may share)`,
      ).toBe(true);
    }
  });
});
