import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.3.2 follow-up — orphaned-notification handling.
 *
 * Two layers of defence:
 *   1. `fetchMyNotifications` filters orphan rows (linked order
 *      missing or RLS-hidden) before they hit the dropdown.
 *   2. The bell client double-checks via /api/notifications/me/check
 *      right before navigating, in case the order was deleted between
 *      the list render and the click. On a "no-go" the row is
 *      marked stale in place + the notification is auto-marked read,
 *      and the dropdown stays open with an inline explanation.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "BELL-ORPHAN-";

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function markAllReadFor(uid: string) {
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", uid)
    .is("read_at", null);
}

async function seedOrphanNotification(uid: string) {
  // A notification whose order_id refers to a UUID that doesn't exist.
  await admin.from("notifications").insert({
    user_id: uid,
    type: "order_branch_rejected",
    payload_json: {
      _fixture: FIXTURE_PREFIX,
      order_id: "00000000-0000-0000-0000-deadbeefdead",
      order_number: "ORD-ORPHAN-DELETED",
      reason: "irrelevant",
      href: "/orders/00000000-0000-0000-0000-deadbeefdead",
    },
  });
}

async function seedNotificationFor(
  uid: string,
  orderId: string,
  orderNumber: string,
) {
  await admin.from("notifications").insert({
    user_id: uid,
    type: "order_branch_rejected",
    payload_json: {
      _fixture: FIXTURE_PREFIX,
      order_id: orderId,
      order_number: orderNumber,
      reason: "Race-test",
      href: `/orders/${orderId}`,
    },
  });
}

async function makeOrderFor(uid: string): Promise<{
  id: string;
  number: string;
}> {
  const { data: roles } = await admin
    .from("user_branch_roles")
    .select("branch_id")
    .eq("user_id", uid)
    .eq("role", "branch_user")
    .not("branch_id", "is", null)
    .single();
  const number = `ORD-ORPHAN-${Date.now()}`;
  const { data } = await admin
    .from("orders")
    .insert({
      order_number: number,
      branch_id: roles!.branch_id!,
      created_by_user_id: uid,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { id: data!.id, number };
}

async function cleanup() {
  await admin
    .from("notifications")
    .delete()
    .filter("payload_json->>_fixture", "eq", FIXTURE_PREFIX);
  // Hard-delete any race-test orders we created.
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .like("order_number", "ORD-ORPHAN-%");
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length > 0) {
    await admin.from("audit_log").delete().eq("entity_type", "order").in("entity_id", ids);
    await admin.from("orders").delete().in("id", ids);
  }
}

test.beforeEach(async () => {
  await cleanup();
  // Start every test with ams.user1's badge at zero.
  await markAllReadFor(await userId("ams.user1@example.nl"));
});
test.afterAll(cleanup);

test.describe("3.3.2 follow-up — orphaned notifications", () => {
  test("notification pointing to a deleted order is hidden from the dropdown list", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    await seedOrphanNotification(uid);

    await signIn(page, "ams.user1@example.nl");
    // The orphan filter runs in `fetchMyNotifications` AND in the
    // /api/notifications/me poll — so once mounted, the bell should
    // expose zero unread (the stale row was dropped).
    await expect(page.getByTestId("notifications-badge")).toHaveCount(0, {
      timeout: 5_000,
    });

    await page.getByTestId("notifications-bell").click();
    const dropdown = page.getByTestId("notifications-dropdown");
    await expect(dropdown).toBeVisible();
    // The orphan headline must NOT appear.
    await expect(dropdown).not.toContainText("ORD-ORPHAN-DELETED");
  });

  test("clicking a notification whose order was deleted between render and click shows an inline message + marks read, no 404", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    const order = await makeOrderFor(uid);
    await seedNotificationFor(uid, order.id, order.number);

    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByTestId("notifications-badge")).toContainText("1", {
      timeout: 5_000,
    });

    await page.getByTestId("notifications-bell").click();
    const dropdown = page.getByTestId("notifications-dropdown");
    await expect(dropdown).toContainText(order.number);

    // Simulate the race: delete the order *after* the dropdown is
    // open but before the user clicks the row. The bell's defensive
    // check should catch this and the row should turn stale.
    await admin.from("orders").delete().eq("id", order.id);

    await page.getByTestId("notifications-item").first().click();

    // Dropdown stays open. The row gets data-stale=true and shows the
    // inline message; URL stays put (no /orders/[id] navigation).
    await expect(dropdown).toBeVisible();
    await expect(
      page.getByTestId("notifications-stale-message"),
    ).toBeVisible();
    await expect(
      page.getByTestId("notifications-item").first(),
    ).toHaveAttribute("data-stale", "true");
    await expect(page).not.toHaveURL(/\/orders\//);

    // Notification was auto-marked read. The mark happens via a
    // post-click server action that settles asynchronously; poll the
    // DB rather than racing it.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("notifications")
            .select("read_at")
            .eq("user_id", uid)
            .filter("payload_json->>_fixture", "eq", FIXTURE_PREFIX)
            .single();
          return data?.read_at ?? null;
        },
        { timeout: 5_000 },
      )
      .not.toBeNull();
  });
});
