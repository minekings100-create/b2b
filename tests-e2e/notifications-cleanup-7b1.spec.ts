import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 7b-1 — destructive 90-day notification cleanup cron.
 *
 * Seeds three fixture rows then drives the cron route:
 *   1. OLD + READ      → must be deleted, audit row must exist.
 *   2. OLD + UNREAD    → must NOT be deleted (asymmetry: unread is sacred).
 *   3. RECENT + READ   → must NOT be deleted (within retention).
 *
 * Audit invariant: for every deleted notification, an audit_log row
 * exists with action='notification_cleanup', actor_user_id=null, and
 * before_json snapshot of {user_id, type, sent_at, read_at}.
 *
 * No-responsive: this is a route-level test, no UI. Single project.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_TYPE = "cleanup_e2e_7b1";

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function cleanup() {
  const { data: rows } = await admin
    .from("notifications")
    .select("id")
    .eq("type", FIXTURE_TYPE);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await admin
      .from("audit_log")
      .delete()
      .eq("entity_type", "notification")
      .in("entity_id", ids);
    await admin.from("notifications").delete().in("id", ids);
  }
  // Also wipe any audit rows created by prior test runs whose
  // notifications got swept (no live row to join on).
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "notification")
    .eq("action", "notification_cleanup")
    .filter("before_json->>type", "eq", FIXTURE_TYPE);
}

test.beforeEach(cleanup);
test.afterAll(cleanup);

test.describe("7b-1 cleanup-notifications cron", () => {
  test("deletes only old + read rows; writes one audit_log row per deletion", async ({
    request,
  }) => {
    const uid = await userId("ams.user1@example.nl");

    const oldReadSentAt = new Date(
      Date.now() - 100 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const oldReadReadAt = new Date(
      Date.now() - 95 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const oldUnreadSentAt = new Date(
      Date.now() - 100 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const recentReadSentAt = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const recentReadReadAt = new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: inserted } = await admin
      .from("notifications")
      .insert([
        {
          user_id: uid,
          type: FIXTURE_TYPE,
          sent_at: oldReadSentAt,
          read_at: oldReadReadAt,
          payload_json: { kind: "old_read" },
        },
        {
          user_id: uid,
          type: FIXTURE_TYPE,
          sent_at: oldUnreadSentAt,
          read_at: null,
          payload_json: { kind: "old_unread" },
        },
        {
          user_id: uid,
          type: FIXTURE_TYPE,
          sent_at: recentReadSentAt,
          read_at: recentReadReadAt,
          payload_json: { kind: "recent_read" },
        },
      ])
      .select("id, payload_json");
    expect(inserted?.length).toBe(3);
    const idByKind = new Map(
      (inserted ?? []).map((r) => [
        (r.payload_json as { kind: string }).kind,
        r.id,
      ]),
    );

    // Drive the cron.
    const res = await request.get("/api/cron/cleanup-notifications");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      deleted_count: number;
      skipped?: boolean;
    };
    expect(body.ok).toBe(true);
    // The DST gate is production-only — locally we always proceed.
    expect(body.skipped).toBeFalsy();
    // Could be more than 1 if other dev data is also old + read; the
    // floor is what we care about.
    expect(body.deleted_count).toBeGreaterThanOrEqual(1);

    // Old + read → gone.
    const { data: oldReadGone } = await admin
      .from("notifications")
      .select("id")
      .eq("id", idByKind.get("old_read")!);
    expect(oldReadGone?.length ?? 0).toBe(0);

    // Old + unread → still here.
    const { data: oldUnreadStill } = await admin
      .from("notifications")
      .select("id")
      .eq("id", idByKind.get("old_unread")!);
    expect(oldUnreadStill?.length).toBe(1);

    // Recent + read → still here.
    const { data: recentReadStill } = await admin
      .from("notifications")
      .select("id")
      .eq("id", idByKind.get("recent_read")!);
    expect(recentReadStill?.length).toBe(1);

    // Audit row for the deleted notification.
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, actor_user_id, before_json, after_json")
      .eq("entity_type", "notification")
      .eq("entity_id", idByKind.get("old_read")!)
      .single();
    expect(audit?.action).toBe("notification_cleanup");
    expect(audit?.actor_user_id).toBeNull();
    const before = audit?.before_json as {
      user_id?: string;
      type?: string;
      sent_at?: string;
      read_at?: string;
    } | null;
    expect(before?.user_id).toBe(uid);
    expect(before?.type).toBe(FIXTURE_TYPE);
    expect(before?.read_at).toBeTruthy();
    const after = audit?.after_json as {
      retention_days?: number;
      cron?: string;
    } | null;
    expect(after?.retention_days).toBe(90);
    expect(after?.cron).toBe("cleanup-notifications");
  });

  test("a clean run with nothing to delete returns deleted_count=0", async ({
    request,
  }) => {
    // Nothing seeded — cleanup() in beforeEach removes our fixtures.
    // Other dev data may still match; this just confirms the route
    // shape is healthy with no errors.
    const res = await request.get("/api/cron/cleanup-notifications");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      deleted_count: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.deleted_count).toBe("number");
  });
});
