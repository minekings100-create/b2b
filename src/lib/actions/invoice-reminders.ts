"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { notify } from "@/lib/email/notify";
import { loadInvoiceReminderContext } from "@/lib/email/invoice-preview";
import type { Json } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 2 — admin-triggered invoice reminder send + bulk
 * variant.
 *
 * Both actions reuse `loadInvoiceReminderContext` so the preview
 * modal and the send path render the same content.
 *
 * Admin (administration + super_admin) only at the action layer; the
 * bulk variant also re-checks on every item so a racing role change
 * doesn't leak a partial send.
 *
 * Audit convention: one `audit_log` row per SENT reminder with
 * `action='invoice_reminder_manual'` — distinct from the cron's
 * `invoice_reminder` so the trail is clear about who triggered it.
 */

export type ReminderSendResult = {
  sent: Array<{ invoice_id: string; invoice_number: string }>;
  failed: Array<{ invoice_id: string; invoice_number?: string; reason: string }>;
};

const SingleInput = z.object({ invoice_id: z.string().uuid() });
const BulkInput = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1).max(500),
});

async function sendOne(
  invoice_id: string,
  actor_uid: string,
): Promise<ReminderSendResult["sent"][number] | { failed: ReminderSendResult["failed"][number] }> {
  const ctx = await loadInvoiceReminderContext(invoice_id);
  if (!ctx.ok) {
    return { failed: { invoice_id, reason: ctx.reason } };
  }
  const adm = createAdminClient();
  try {
    await notify({
      db: adm,
      type: "invoice_overdue_reminder",
      recipients: ctx.context.recipients,
      rendered: ctx.context.rendered,
      payload: ctx.context.payload as Record<string, Json>,
    });
  } catch (e) {
    return {
      failed: {
        invoice_id,
        invoice_number: ctx.context.invoice_number,
        reason: e instanceof Error ? e.message : String(e),
      },
    };
  }
  // Audit row — actor_user_id binds to the admin who clicked send.
  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: invoice_id,
    action: "invoice_reminder_manual",
    actor_user_id: actor_uid,
    before_json: null,
    after_json: {
      invoice_number: ctx.context.invoice_number,
      days_overdue: ctx.context.days_overdue,
      recipients: ctx.context.recipients.map((r) => r.email),
    } as unknown as Json,
  });
  return {
    invoice_id,
    invoice_number: ctx.context.invoice_number,
  };
}

export async function sendSingleReminder(
  invoice_id: string,
): Promise<ReminderSendResult> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles))
    return { sent: [], failed: [{ invoice_id, reason: "Forbidden" }] };

  const parsed = SingleInput.safeParse({ invoice_id });
  if (!parsed.success)
    return { sent: [], failed: [{ invoice_id, reason: "Invalid id" }] };

  const out: ReminderSendResult = { sent: [], failed: [] };
  const result = await sendOne(parsed.data.invoice_id, session.user.id);
  if ("failed" in result) out.failed.push(result.failed);
  else out.sent.push(result);

  revalidatePath(`/invoices/${invoice_id}`);
  revalidatePath("/invoices");
  return out;
}

export async function sendBulkReminders(
  invoice_ids: string[],
): Promise<ReminderSendResult> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles))
    return {
      sent: [],
      failed: invoice_ids.map((id) => ({
        invoice_id: id,
        reason: "Forbidden",
      })),
    };

  const parsed = BulkInput.safeParse({ invoice_ids });
  if (!parsed.success) {
    return {
      sent: [],
      failed: invoice_ids.map((id) => ({
        invoice_id: id,
        reason: "Invalid input",
      })),
    };
  }

  const out: ReminderSendResult = { sent: [], failed: [] };
  // Sequential by design — brief calls it out, and failure isolation
  // is clearer when each send completes before the next begins.
  // (Parallelising with Promise.all would also skew timestamps in the
  // audit trail in ways that make post-hoc review harder.)
  for (const id of parsed.data.invoice_ids) {
    const r = await sendOne(id, session.user.id);
    if ("failed" in r) out.failed.push(r.failed);
    else out.sent.push(r);
  }

  revalidatePath("/invoices");
  return out;
}

/**
 * Toggle the per-user "skip email preview next time" preference —
 * stored under `notification_preferences.skip_email_preview` as a
 * top-level boolean. Existing notification-routing keys
 * (state_changes / admin_alerts) are untouched.
 */
export async function setSkipEmailPreview(
  skip: boolean,
): Promise<{ ok: true } | { error: string }> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const supabase = createClient();
  // Merge into existing JSONB rather than overwrite.
  const { data: prior } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", session.user.id)
    .maybeSingle();
  const existing =
    (prior?.notification_preferences as Record<string, unknown>) ?? {};
  const next = { ...existing, skip_email_preview: skip };
  const { error } = await supabase
    .from("users")
    .update({ notification_preferences: next as Json })
    .eq("id", session.user.id);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Read the per-user skip flag. Defaults to false. */
export async function getSkipEmailPreview(): Promise<boolean> {
  const session = await getUserWithRoles();
  if (!session) return false;
  const supabase = createClient();
  const { data } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", session.user.id)
    .maybeSingle();
  const prefs = (data?.notification_preferences as
    | { skip_email_preview?: boolean }
    | null) ?? null;
  return prefs?.skip_email_preview === true;
}
