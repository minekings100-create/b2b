import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { managersForBranch, type Recipient } from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import { renderInvoiceOverdueReminder } from "@/lib/email/templates";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Phase 5 — nightly overdue-invoice cron (SPEC §8.6).
 *
 * Runs at 02:00 Europe/Amsterdam (vercel.json cron `0 0 * * *` UTC =
 * 02:00 CET in winter, 03:00 CEST in summer — same DST drift as the
 * other crons, tracked in BACKLOG's Phase 7 polish entry).
 *
 * Two things happen per run:
 *   1. Any `issued` invoice whose `due_at` has passed gets flipped
 *      to `overdue` (status-guarded UPDATE so a concurrent `paid` /
 *      `cancelled` wins).
 *   2. For every `overdue` invoice, compute days_overdue. If it's
 *      exactly 7, 14, or 30 AND no prior `invoice_reminder` row in
 *      audit_log already carries that day count, send a reminder
 *      email to branch managers + write the audit row. Idempotent:
 *      rerunning the cron the same day is a no-op.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REMINDER_DAYS = [7, 14, 30] as const;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const adm = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // --- step 1 — flip newly-overdue invoices --------------------------------
  const { data: toFlip } = await adm
    .from("invoices")
    .select("id, invoice_number, branch_id, due_at, total_gross_cents")
    .eq("status", "issued")
    .lt("due_at", nowIso)
    .is("deleted_at", null);

  let flippedCount = 0;
  for (const inv of toFlip ?? []) {
    const { data: updated } = await adm
      .from("invoices")
      .update({ status: "overdue" })
      .eq("id", inv.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();
    if (!updated) continue; // raced with another write — skip
    flippedCount += 1;
    await adm.from("audit_log").insert({
      entity_type: "invoice",
      entity_id: inv.id,
      action: "invoice_overdue",
      actor_user_id: null,
      before_json: { status: "issued" } as Json,
      after_json: {
        status: "overdue",
        invoice_number: inv.invoice_number,
        due_at: inv.due_at,
      } as unknown as Json,
    });
  }

  // --- step 2 — send reminder emails at 7 / 14 / 30 days past due ---------
  const remindersSent = await sendReminders(adm, now);

  return NextResponse.json({
    ok: true,
    now: nowIso,
    candidates_flipped: toFlip?.length ?? 0,
    flipped: flippedCount,
    reminders_sent: remindersSent,
  });
}

async function sendReminders(
  adm: SupabaseClient<Database>,
  now: Date,
): Promise<number> {
  const { data: overdue } = await adm
    .from("invoices")
    .select(
      "id, invoice_number, branch_id, due_at, total_gross_cents, status",
    )
    .eq("status", "overdue")
    .is("deleted_at", null);
  if (!overdue || overdue.length === 0) return 0;

  let sent = 0;
  for (const inv of overdue) {
    if (!inv.due_at) continue;
    const dueMs = new Date(inv.due_at).getTime();
    const days = Math.floor((now.getTime() - dueMs) / (24 * 60 * 60 * 1000));
    if (!REMINDER_DAYS.includes(days as (typeof REMINDER_DAYS)[number])) continue;

    // Dedupe: has a reminder for this invoice + this day-count already
    // been written? Run this cron twice the same day and nothing
    // double-sends.
    const { data: prior } = await adm
      .from("audit_log")
      .select("id, after_json")
      .eq("entity_type", "invoice")
      .eq("entity_id", inv.id)
      .eq("action", "invoice_reminder");
    const alreadySent = (prior ?? []).some((row) => {
      const after = (row.after_json ?? {}) as { days_overdue?: unknown };
      return after.days_overdue === days;
    });
    if (alreadySent) continue;

    const { data: branch } = await adm
      .from("branches")
      .select("branch_code, name")
      .eq("id", inv.branch_id)
      .maybeSingle();
    const recipients: Recipient[] = await managersForBranch(adm, inv.branch_id);
    if (recipients.length === 0) continue;

    const rendered = renderInvoiceOverdueReminder({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      branch_code: branch?.branch_code ?? "—",
      branch_name: branch?.name ?? "—",
      total_gross_cents: inv.total_gross_cents,
      due_at: inv.due_at,
      days_overdue: days,
    });
    await notify({
      db: adm,
      type: "invoice_overdue_reminder",
      recipients,
      rendered,
      payload: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        branch_code: branch?.branch_code ?? null,
        days_overdue: days,
        due_at: inv.due_at,
        total_gross_cents: inv.total_gross_cents,
        href: `/invoices/${inv.id}`,
      },
    });

    await adm.from("audit_log").insert({
      entity_type: "invoice",
      entity_id: inv.id,
      action: "invoice_reminder",
      actor_user_id: null,
      before_json: null,
      after_json: {
        invoice_number: inv.invoice_number,
        days_overdue: days,
        due_at: inv.due_at,
      } as unknown as Json,
    });
    sent += 1;
  }
  return sent;
}
