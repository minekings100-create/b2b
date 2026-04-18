import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.3.2 — in-app notification bell.
 *
 * The bell consumes notifications written by 3.3.1's triggers. Tests
 * here seed rows directly via the admin client (no UI dependency on a
 * specific lifecycle action) so the assertions stay focused on the
 * bell behaviour: badge, dropdown content, mark-all, navigation,
 * role-scope, polling.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "BELL-E2E-";

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

async function seedNotificationsFor(
  uid: string,
  rows: Array<{
    type: string;
    payload: Record<string, unknown>;
    read?: boolean;
    sent_at?: string;
  }>,
) {
  await admin.from("notifications").insert(
    rows.map((r) => ({
      user_id: uid,
      type: r.type,
      payload_json: { ...r.payload, _fixture: FIXTURE_PREFIX },
      sent_at: r.sent_at ?? new Date().toISOString(),
      read_at: r.read ? new Date().toISOString() : null,
    })),
  );
}

async function cleanup() {
  await admin
    .from("notifications")
    .delete()
    .filter("payload_json->>_fixture", "eq", FIXTURE_PREFIX);
}

/**
 * Tests that assert "badge = 0" or "badge = N" need a known starting
 * point. The shared demo DB can carry stale notifications for the
 * fixture users (e.g. left over from prior 3.3.1 / 3.2.2 runs). Mark
 * everything as read for the named user before each test runs so the
 * badge starts at zero.
 */
async function markAllReadFor(uid: string) {
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", uid)
    .is("read_at", null);
}

test.beforeEach(async () => {
  await cleanup();
  // Pre-clear any stale unread for the fixture users. The bell reads
  // raw counts from the DB, so leftover state from earlier suite runs
  // would skew the assertions.
  for (const email of [
    "ams.user1@example.nl",
    "ams.user2@example.nl",
    "super@example.nl",
  ]) {
    const uid = await userId(email);
    await markAllReadFor(uid);
  }
});
test.afterAll(cleanup);

test.describe("3.3.2 notifications bell — basic surface", () => {
  test("bell + badge appear in the top bar with the unread count seeded server-side", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    await seedNotificationsFor(uid, [
      {
        type: "order_branch_rejected",
        payload: {
          order_id: "00000000-0000-0000-0000-000000000001",
          order_number: "ORD-BELL-1",
          reason: "Over budget",
          href: "/orders/00000000-0000-0000-0000-000000000001",
        },
      },
      {
        type: "order_cancelled",
        payload: {
          order_id: "00000000-0000-0000-0000-000000000002",
          order_number: "ORD-BELL-2",
          href: "/orders/00000000-0000-0000-0000-000000000002",
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");

    const bell = page.getByTestId("notifications-bell");
    await expect(bell).toBeVisible();
    const badge = page.getByTestId("notifications-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("2");
  });

  test("clicking the bell opens the dropdown and renders item headlines", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    await seedNotificationsFor(uid, [
      {
        type: "order_branch_rejected",
        payload: {
          order_id: "abc",
          order_number: "ORD-BELL-77",
          reason: "Over budget — please resubmit next month",
          href: "/orders/abc",
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");
    await page.getByTestId("notifications-bell").click();
    const dropdown = page.getByTestId("notifications-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText("ORD-BELL-77");
    await expect(dropdown).toContainText(/rejected by branch/i);
  });

  test("badge disappears when the user has no unread notifications", async ({
    page,
  }) => {
    // markAllReadFor in beforeEach has cleared every unread row for
    // ams.user1, so the badge starts at zero. The dropdown's
    // "all-caught-up" empty state itself is a function of `recent.length`
    // — pinned by the headline unit tests. We don't assert it here
    // because demo seeds + previous suite runs leave historic *read*
    // rows in the recent list, which is correct behaviour but
    // intentionally NOT the empty state.
    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByTestId("notifications-badge")).toHaveCount(0);
  });
});

test.describe("3.3.2 mark-as-read flows", () => {
  test("'Mark all read' clears the badge + dims rows in the dropdown", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    await seedNotificationsFor(uid, [
      {
        type: "order_cancelled",
        payload: {
          order_id: "id1",
          order_number: "ORD-BELL-A",
          href: "/orders/id1",
        },
      },
      {
        type: "order_cancelled",
        payload: {
          order_id: "id2",
          order_number: "ORD-BELL-B",
          href: "/orders/id2",
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByTestId("notifications-badge")).toContainText("2");

    await page.getByTestId("notifications-bell").click();
    await page.getByTestId("notifications-mark-all").click();

    await expect(page.getByTestId("notifications-badge")).toHaveCount(0);

    // The badge clears optimistically; the underlying server-action
    // UPDATE settles asynchronously. Poll the DB until every fixture
    // row has a read_at (or fail if it doesn't within 5s).
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("notifications")
            .select("read_at")
            .eq("user_id", uid)
            .filter("payload_json->>_fixture", "eq", FIXTURE_PREFIX);
          return (data ?? []).every((r) => r.read_at !== null);
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  });

  test("clicking a notification navigates to its href and marks it read", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    // Pick an existing demo order so the navigation lands on a real
    // detail page rather than 404'ing.
    const { data: anyOrder } = await admin
      .from("orders")
      .select("id, order_number")
      .eq("created_by_user_id", uid)
      .like("order_number", "DEMO-%")
      .limit(1)
      .maybeSingle();
    test.skip(!anyOrder, "no demo order owned by ams.user1 to navigate to");

    await seedNotificationsFor(uid, [
      {
        type: "order_branch_rejected",
        payload: {
          order_id: anyOrder!.id,
          order_number: anyOrder!.order_number,
          href: `/orders/${anyOrder!.id}`,
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");
    await page.getByTestId("notifications-bell").click();
    await page.getByTestId("notifications-item").first().click();

    await expect(page).toHaveURL(new RegExp(`/orders/${anyOrder!.id}`));

    // Read flag persisted (poll — the mark-read server action settles
    // asynchronously after the optimistic UI update).
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("notifications")
            .select("read_at")
            .eq("user_id", uid)
            .filter("payload_json->>_fixture", "eq", FIXTURE_PREFIX)
            .maybeSingle();
          return data?.read_at ?? null;
        },
        { timeout: 5_000 },
      )
      .not.toBeNull();
  });
});

test.describe("3.3.2 RLS + role scope", () => {
  test("a different user's notifications never appear on this user's bell", async ({
    page,
  }) => {
    const me = await userId("ams.user1@example.nl");
    const someoneElse = await userId("ams.user2@example.nl");
    await seedNotificationsFor(someoneElse, [
      {
        type: "order_cancelled",
        payload: {
          order_id: "x",
          order_number: "ORD-BELL-OTHER",
          href: "/orders/x",
        },
      },
    ]);
    await seedNotificationsFor(me, [
      {
        type: "order_cancelled",
        payload: {
          order_id: "y",
          order_number: "ORD-BELL-MINE",
          href: "/orders/y",
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByTestId("notifications-badge")).toContainText("1");
    await page.getByTestId("notifications-bell").click();
    const dropdown = page.getByTestId("notifications-dropdown");
    await expect(dropdown).toContainText("ORD-BELL-MINE");
    await expect(dropdown).not.toContainText("ORD-BELL-OTHER");
  });
});

test.describe("3.3.2 polling", () => {
  test("badge picks up a new notification on the next poll without a refresh", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    await seedNotificationsFor(uid, [
      {
        type: "order_cancelled",
        payload: {
          order_id: "z",
          order_number: "ORD-BELL-INITIAL",
          href: "/orders/z",
        },
      },
    ]);

    await signIn(page, "ams.user1@example.nl");
    await expect(page.getByTestId("notifications-badge")).toContainText("1");

    // Insert a new row via the admin client (simulating a trigger
    // firing while the user is on a page) and ask the bell to refetch.
    await seedNotificationsFor(uid, [
      {
        type: "order_branch_approved",
        payload: {
          order_id: "z2",
          order_number: "ORD-BELL-LIVE",
          href: "/orders/z2",
        },
      },
    ]);

    // The bell polls every 30s; rather than waiting, drive a refetch
    // by toggling document.visibilityState back to "visible" — the
    // listener's onVisibility runs `refresh()` immediately.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(page.getByTestId("notifications-badge")).toContainText("2", {
      timeout: 5_000,
    });
  });
});
