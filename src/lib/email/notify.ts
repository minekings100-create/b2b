import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import {
  appBaseUrl,
  fromAddress,
  getEmailTransport,
  type EmailMessage,
} from "./transport";
import type { Recipient } from "./recipients";
import type { RenderedEmail } from "./templates";
import { textFooter } from "./templates/_layout";
import {
  FORCED_EMAIL_TRIGGERS,
  TRIGGER_CATEGORY,
  type NotificationCategory,
  type NotificationTriggerType,
} from "./categories";
import { encode as encodeUnsubscribeToken } from "./unsubscribe-token";

/**
 * High-level emit helper. For each recipient:
 *   1. If the user opts in for `in_app` on this trigger's category,
 *      insert a row into `notifications` so 3.3.2's bell has data.
 *      Bypasses RLS via the service-role client (the policy in
 *      20260417000011 restricts insert to admins).
 *   2. If the user opts in for `email`, OR the trigger is on the
 *      `FORCED_EMAIL_TRIGGERS` whitelist, fire the email transport.
 *      Transport failures are logged but never rethrown — a hiccup
 *      must not roll back the underlying mutation.
 *
 * `payload` is mirrored verbatim into `notifications.payload_json` so
 * the bell can render rich content without re-fetching the source entity.
 *
 * `type` is the closed `NotificationTriggerType` union (step 3,
 * categories.ts). Call sites that pass a string literal outside the
 * union fail to typecheck — intended. When a new trigger is introduced,
 * register it in `categories.ts` first (type union + TRIGGER_CATEGORY)
 * and this function starts accepting it automatically.
 */
export type NotifyArgs = {
  db: SupabaseClient<Database>;
  type: NotificationTriggerType;
  recipients: Recipient[];
  rendered: RenderedEmail;
  payload?: Record<string, unknown>;
};

type PrefShape = Record<
  NotificationCategory,
  { email: boolean; in_app: boolean }
>;

export async function notify({
  db,
  type,
  recipients,
  rendered,
  payload,
}: NotifyArgs): Promise<{ inserted: number; sent: number }> {
  if (recipients.length === 0) return { inserted: 0, sent: 0 };

  const category = TRIGGER_CATEGORY[type];
  // Forced list overrides email preference only. In-app remains user-controlled — the email is the durable compliance record, the bell is ephemeral.
  const isForcedEmail = FORCED_EMAIL_TRIGGERS.includes(type);

  // Bulk read prefs for every recipient. On a transient read failure
  // (returned empty rows / a query error) we fall back to the permissive
  // default — over-notify beats silently muting a compliance alert on
  // a DB hiccup. Same philosophy as the send-failure handling below.
  const { data: prefRows } = await db
    .from("users")
    .select("id, notification_preferences")
    .in("id", recipients.map((r) => r.user_id));
  const prefByUserId = new Map<string, PrefShape>();
  for (const row of prefRows ?? []) {
    prefByUserId.set(row.id, (row.notification_preferences ?? {}) as PrefShape);
  }

  function wantsInApp(userId: string): boolean {
    return prefByUserId.get(userId)?.[category]?.in_app ?? true;
  }
  function wantsEmail(userId: string): boolean {
    if (isForcedEmail) return true;
    return prefByUserId.get(userId)?.[category]?.email ?? true;
  }

  // --- 1. in-app rows — filtered by each recipient's in_app preference ----
  const inAppRecipients = recipients.filter((r) => wantsInApp(r.user_id));
  const rows = inAppRecipients.map((r) => ({
    user_id: r.user_id,
    type,
    payload_json: (payload ?? {}) as unknown as Json,
  }));
  let inserted = 0;
  if (rows.length > 0) {
    const { error: insertErr } = await db.from("notifications").insert(rows);
    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[notify] failed to insert notifications type=${type} count=${rows.length}: ${insertErr.message}`,
      );
    } else {
      inserted = rows.length;
    }
  }

  // --- 2. email — forced bypass OR per-recipient pref ---------------------
  const transport = getEmailTransport();
  let sent = 0;
  for (const r of recipients) {
    if (!wantsEmail(r.user_id)) {
      // Non-forced send skipped by user preference. Dev feedback only —
      // never log for forced sends (those are expected) and never log
      // payload contents (potentially sensitive + noisy).
      // eslint-disable-next-line no-console
      console.info(
        `[notify] skipped email to ${r.user_id}: opted out of ${category}`,
      );
      continue;
    }
    // Per-recipient composition — sign an unsubscribe token and swap
    // the placeholders baked in by htmlLayout / textFooter. This keeps
    // the template layer pure (one render per trigger) while still
    // producing unique unsubscribe links per recipient.
    const unsubscribeUrl = `${appBaseUrl()}/unsubscribe?t=${encodeURIComponent(
      encodeUnsubscribeToken({
        user_id: r.user_id,
        category,
        issued_at: Math.floor(Date.now() / 1000),
      }),
    )}`;
    const prefsUrl = `${appBaseUrl()}/settings/notifications`;
    const composedHtml = rendered.html
      .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
      .replace(/\{\{PREFS_URL\}\}/g, prefsUrl);
    const composedText = `${rendered.text}\n\n${textFooter()}`
      .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
      .replace(/\{\{PREFS_URL\}\}/g, prefsUrl);

    const message: EmailMessage = {
      to: r.email,
      subject: rendered.subject,
      html: composedHtml,
      text: composedText,
      type,
      payload,
    };
    try {
      const res = await transport.send(message);
      if (res.ok) sent += 1;
      else {
        // eslint-disable-next-line no-console
        console.error(
          `[notify] transport ${transport.name} failed for ${r.email}: ${res.error}`,
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[notify] transport ${transport.name} threw for ${r.email}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { inserted, sent };
}

export { fromAddress };
