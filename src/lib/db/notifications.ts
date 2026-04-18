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

export async function fetchMyNotifications(): Promise<NotificationsSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { unread_count: 0, recent: [] };

  // Two queries in parallel — count of unread + the latest 10 (read or
  // unread). Total cost is two indexed lookups on `notifications_user_idx`
  // / `notifications_unread_idx`.
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
      .limit(RECENT_LIMIT),
  ]);
  if (error) throw error;

  const recent: NotificationCard[] = (data ?? []).map((row) => {
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

  return { unread_count: count ?? 0, recent };
}

// Re-exported only so the e2e fixture can build payloads matching the
// real shape without having to construct a Json by hand.
export type NotificationPayload = Json;
