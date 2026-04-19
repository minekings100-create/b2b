import "server-only";

import { createClient } from "@/lib/supabase/server";
import { describeNotification } from "@/lib/notifications/headline";
import type { Json } from "@/lib/supabase/types";

/**
 * Per-user notifications query — backs the 3.3.2 bell. RLS already
 * scopes the result to the caller (`notifications_select` policy:
 * `user_id = auth.uid()` OR admin/super sees all). Admins legitimately
 * see other users' notifications via that policy; the bell still only
 * shows the caller's so we filter explicitly.
 */

export type NotificationCard = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  sent_at: string;
  read_at: string | null;
  /** Resolved click-target for the dropdown row. Falls back to "/" if absent. */
  href: string;
  /** Short human-readable headline derived from `type` + payload. */
  headline: string;
};

export type NotificationsSnapshot = {
  unread_count: number;
  recent: NotificationCard[];
};

const RECENT_LIMIT = 10;
// Over-fetch so we still have ~10 visible items after dropping orphans
// (notifications whose linked entity has been deleted). 30 covers the
// realistic worst case — a user with a few stale references won't see
// a half-empty dropdown.
const RAW_FETCH_LIMIT = 30;

export async function fetchMyNotifications(): Promise<NotificationsSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { unread_count: 0, recent: [] };

  // Two queries in parallel — count of unread + the latest N rows (read
  // or unread). The count is the *raw* unread total; if the recent slice
  // contains orphans we adjust the count down by the same delta below
  // so the badge stays consistent with what the dropdown shows.
  const [{ count }, { data, error }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("notifications")
      .select("id, type, payload_json, sent_at, read_at")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(RAW_FETCH_LIMIT),
  ]);
  if (error) throw error;

  const raw: NotificationCard[] = (data ?? []).map((row) => {
    const payload = (row.payload_json ?? {}) as Record<string, unknown>;
    const href = typeof payload.href === "string" ? payload.href : "/";
    return {
      id: row.id,
      type: row.type,
      payload,
      sent_at: row.sent_at,
      read_at: row.read_at,
      href,
      headline: describeNotification(row.type, payload),
    };
  });

  // Drop orphan rows: notifications whose linked order has been
  // deleted (or RLS-hidden from the caller). Currently every
  // notification type targets an order; when invoices / pallets / etc.
  // get notification triggers in later phases, extend this filter to
  // dispatch on `type`.
  const filtered = await dropOrphanedNotifications(supabase, raw);

  // Adjust the raw unread count by the unread orphans we filtered out
  // so the badge matches the dropdown.
  const orphanUnreadDrop = raw.filter(
    (r) => !r.read_at && !filtered.some((f) => f.id === r.id),
  ).length;
  const adjustedCount = Math.max(0, (count ?? 0) - orphanUnreadDrop);

  return {
    unread_count: adjustedCount,
    recent: filtered.slice(0, RECENT_LIMIT),
  };
}

/**
 * Returns true if the order referenced by this notification's payload
 * is still RLS-visible to the caller. Used by the bell client's
 * defensive click handler to avoid the race where the list was rendered
 * with a valid order but the order got deleted before the click.
 */
export async function isNotificationTargetReachable(
  notificationId: string,
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: notif } = await supabase
    .from("notifications")
    .select("payload_json")
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!notif) return false;

  const orderId = extractOrderId(notif.payload_json);
  if (!orderId) return true; // No linked entity — nothing to verify.

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  return order !== null;
}

async function dropOrphanedNotifications(
  supabase: ReturnType<typeof createClient>,
  rows: NotificationCard[],
): Promise<NotificationCard[]> {
  const orderIds = Array.from(
    new Set(
      rows
        .map((r) => extractOrderId(r.payload as Json))
        .filter((x): x is string => typeof x === "string"),
    ),
  );
  if (orderIds.length === 0) return rows;

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .is("deleted_at", null);
  const valid = new Set((existing ?? []).map((o) => o.id));

  return rows.filter((r) => {
    const oid = extractOrderId(r.payload as Json);
    if (!oid) return true; // Not order-linked — keep.
    return valid.has(oid);
  });
}

function extractOrderId(payload: Json | null): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const oid = (payload as Record<string, unknown>).order_id;
  return typeof oid === "string" && /^[0-9a-f-]{36}$/i.test(oid) ? oid : null;
}

// Re-exported only so the e2e fixture can build payloads matching the
// real shape without having to construct a Json by hand.
export type NotificationPayload = Json;
