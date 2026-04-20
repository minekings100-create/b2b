import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { managersForBranch, type Recipient } from "@/lib/email/recipients";
import {
  renderInvoiceIssued,
  renderInvoiceOverdueReminder,
  type RenderedEmail,
} from "@/lib/email/templates";
import type { Database } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 2 — shared preview + load helpers for invoice
 * emails (issued + overdue reminder).
 *
 * The render functions themselves (`renderInvoiceIssued`,
 * `renderInvoiceOverdueReminder`) are pure and already shipped with
 * Phase 5. This module owns the DB-fetch + recipient-resolution plumbing
 * so the preview flow and the send flow share one code path:
 *
 *   preview → loadInvoiceReminderContext(id) → {rendered, recipients}
 *   send    → same call → notify() + audit
 */

export type InvoicePreviewContext = {
  kind: "invoice_issued" | "invoice_overdue_reminder";
  invoice_id: string;
  invoice_number: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  recipients: Recipient[];
  rendered: RenderedEmail;
  payload: Record<string, unknown>;
  // Only populated for the reminder kind.
  days_overdue?: number;
};

/** Build the full preview context for an overdue-reminder email. */
export async function loadInvoiceReminderContext(
  invoice_id: string,
  nowIso: string = new Date().toISOString(),
): Promise<
  | { ok: true; context: InvoicePreviewContext }
  | { ok: false; reason: string }
> {
  const adm: SupabaseClient<Database> = createAdminClient();
  const { data: inv } = await adm
    .from("invoices")
    .select(
      "id, invoice_number, branch_id, status, due_at, total_gross_cents, deleted_at",
    )
    .eq("id", invoice_id)
    .maybeSingle();
  if (!inv) return { ok: false, reason: "Invoice not found" };
  if (inv.deleted_at) return { ok: false, reason: "Invoice is archived" };
  if (inv.status !== "overdue" && inv.status !== "issued") {
    return {
      ok: false,
      reason: `Reminder not applicable — invoice status is ${inv.status}`,
    };
  }
  if (!inv.due_at) return { ok: false, reason: "Invoice has no due date" };

  const { data: branch } = await adm
    .from("branches")
    .select("branch_code, name")
    .eq("id", inv.branch_id)
    .maybeSingle();
  const recipients = await managersForBranch(adm, inv.branch_id);
  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "No branch managers configured for this branch",
    };
  }

  const dueMs = new Date(inv.due_at).getTime();
  const nowMs = new Date(nowIso).getTime();
  const days_overdue = Math.max(
    0,
    Math.floor((nowMs - dueMs) / (24 * 60 * 60 * 1000)),
  );

  const rendered = renderInvoiceOverdueReminder({
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
    total_gross_cents: inv.total_gross_cents,
    due_at: inv.due_at,
    days_overdue,
  });

  return {
    ok: true,
    context: {
      kind: "invoice_overdue_reminder",
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      branch_id: inv.branch_id,
      branch_code: branch?.branch_code ?? "—",
      branch_name: branch?.name ?? "—",
      recipients,
      rendered,
      payload: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        branch_code: branch?.branch_code ?? null,
        days_overdue,
        due_at: inv.due_at,
        total_gross_cents: inv.total_gross_cents,
        href: `/invoices/${inv.id}`,
      },
      days_overdue,
    },
  };
}

/** Build the full preview context for an invoice-issued email.
 *
 * Drafts don't carry `due_at` yet — it's stamped at `issueInvoice`
 * time (today + 30 days UTC). For the preview we simulate the same
 * computation so the admin sees the real email shape, not an error.
 */
const PAYMENT_TERM_DAYS_PREVIEW = 30;

export async function loadInvoiceIssuedContext(
  invoice_id: string,
): Promise<
  | { ok: true; context: InvoicePreviewContext }
  | { ok: false; reason: string }
> {
  const adm: SupabaseClient<Database> = createAdminClient();
  const { data: inv } = await adm
    .from("invoices")
    .select(
      "id, invoice_number, branch_id, order_id, status, due_at, total_gross_cents, deleted_at",
    )
    .eq("id", invoice_id)
    .maybeSingle();
  if (!inv) return { ok: false, reason: "Invoice not found" };
  if (inv.deleted_at) return { ok: false, reason: "Invoice is archived" };
  const effectiveDueAt =
    inv.due_at ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + PAYMENT_TERM_DAYS_PREVIEW);
      return d.toISOString();
    })();

  const { data: branch } = await adm
    .from("branches")
    .select("branch_code, name")
    .eq("id", inv.branch_id)
    .maybeSingle();
  const recipients = await managersForBranch(adm, inv.branch_id);
  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "No branch managers configured for this branch",
    };
  }
  let order_number: string | null = null;
  if (inv.order_id) {
    const { data: order } = await adm
      .from("orders")
      .select("order_number")
      .eq("id", inv.order_id)
      .maybeSingle();
    order_number = order?.order_number ?? null;
  }

  const rendered = renderInvoiceIssued({
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
    order_number,
    total_gross_cents: inv.total_gross_cents,
    due_at: effectiveDueAt,
  });

  return {
    ok: true,
    context: {
      kind: "invoice_issued",
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      branch_id: inv.branch_id,
      branch_code: branch?.branch_code ?? "—",
      branch_name: branch?.name ?? "—",
      recipients,
      rendered,
      payload: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        branch_code: branch?.branch_code ?? null,
        due_at: effectiveDueAt,
        total_gross_cents: inv.total_gross_cents,
        href: `/invoices/${inv.id}`,
      },
    },
  };
}
