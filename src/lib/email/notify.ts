import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import {
  fromAddress,
  getEmailTransport,
  type EmailMessage,
} from "./transport";
import type { Recipient } from "./recipients";
import type { RenderedEmail } from "./templates";

/**
 * High-level emit helper. For each recipient:
 *   1. Insert a row into `notifications` (so 3.3.2's bell has data even when
 *      the email transport no-ops). Bypasses RLS via the service-role
 *      client because the acting user usually doesn't have INSERT on
 *      notifications (policy in 20260417000011 restricts insert to admins).
 *   2. Fire the email transport. Failures are logged but never rethrown —
 *      a transport hiccup must not roll back the underlying mutation.
 *
 * `payload` is mirrored verbatim into `notifications.payload_json` so the
 * bell can render rich content without re-fetching the source entity.
 */
export type NotifyArgs = {
  /** Service-role admin client. Required because notifications.insert is admin-only. */
  db: SupabaseClient<Database>;
  type: string;
  recipients: Recipient[];
  rendered: RenderedEmail;
  payload?: Record<string, unknown>;
};

export async function notify({
  db,
  type,
  recipients,
  rendered,
  payload,
}: NotifyArgs): Promise<{ inserted: number; sent: number }> {
  if (recipients.length === 0) return { inserted: 0, sent: 0 };

  const rows = recipients.map((r) => ({
    user_id: r.user_id,
    type,
    payload_json: (payload ?? {}) as unknown as Json,
  }));

  const { error: insertErr } = await db.from("notifications").insert(rows);
  if (insertErr) {
    // Surface — caller decides whether to fail the action. Currently every
    // call site logs and continues; we never want a notifications outage to
    // roll back an order state change.
    // eslint-disable-next-line no-console
    console.error(
      `[notify] failed to insert notifications type=${type} count=${rows.length}: ${insertErr.message}`,
    );
  }

  const transport = getEmailTransport();
  let sent = 0;
  for (const r of recipients) {
    const message: EmailMessage = {
      to: r.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
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

  return { inserted: insertErr ? 0 : rows.length, sent };
}

export { fromAddress };
