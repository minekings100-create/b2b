"use server";

import { redirect } from "next/navigation";

import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  loadInvoiceIssuedContext,
  loadInvoiceReminderContext,
} from "@/lib/email/invoice-preview";

/**
 * Post-MVP Sprint 2 — server-side preview loaders. Keep the HTML-
 * render code on the server (templates module is server-only); return
 * a shape the modal client component can render directly.
 */

export type EmailPreview = {
  kind: "invoice_issued" | "invoice_overdue_reminder";
  invoice_id: string;
  invoice_number: string;
  recipients: string[];
  subject: string;
  html: string;
  text: string;
  days_overdue?: number;
};

export async function getInvoiceReminderPreview(
  invoice_id: string,
): Promise<{ ok: true; preview: EmailPreview } | { error: string }> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const ctx = await loadInvoiceReminderContext(invoice_id);
  if (!ctx.ok) return { error: ctx.reason };
  return {
    ok: true,
    preview: {
      kind: "invoice_overdue_reminder",
      invoice_id: ctx.context.invoice_id,
      invoice_number: ctx.context.invoice_number,
      recipients: ctx.context.recipients.map((r) => r.email),
      subject: ctx.context.rendered.subject,
      html: ctx.context.rendered.html,
      text: ctx.context.rendered.text,
      days_overdue: ctx.context.days_overdue,
    },
  };
}

export async function getInvoiceIssuedPreview(
  invoice_id: string,
): Promise<{ ok: true; preview: EmailPreview } | { error: string }> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const ctx = await loadInvoiceIssuedContext(invoice_id);
  if (!ctx.ok) return { error: ctx.reason };
  return {
    ok: true,
    preview: {
      kind: "invoice_issued",
      invoice_id: ctx.context.invoice_id,
      invoice_number: ctx.context.invoice_number,
      recipients: ctx.context.recipients.map((r) => r.email),
      subject: ctx.context.rendered.subject,
      html: ctx.context.rendered.html,
      text: ctx.context.rendered.text,
    },
  };
}

/**
 * Bulk-preview helper. Returns the FIRST reminder as a representative
 * sample + total count + per-invoice pre-flight status so the UI can
 * warn "3 of 12 can't be sent: reason X" before the user clicks.
 */
export type BulkPreview = {
  total: number;
  sendable: EmailPreview[];
  sample: EmailPreview | null;
  skipped: Array<{ invoice_id: string; reason: string }>;
};

export async function getBulkReminderPreview(
  invoice_ids: string[],
): Promise<{ ok: true; preview: BulkPreview } | { error: string }> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const sendable: EmailPreview[] = [];
  const skipped: BulkPreview["skipped"] = [];
  for (const id of invoice_ids) {
    const ctx = await loadInvoiceReminderContext(id);
    if (!ctx.ok) {
      skipped.push({ invoice_id: id, reason: ctx.reason });
      continue;
    }
    sendable.push({
      kind: "invoice_overdue_reminder",
      invoice_id: ctx.context.invoice_id,
      invoice_number: ctx.context.invoice_number,
      recipients: ctx.context.recipients.map((r) => r.email),
      subject: ctx.context.rendered.subject,
      html: ctx.context.rendered.html,
      text: ctx.context.rendered.text,
      days_overdue: ctx.context.days_overdue,
    });
  }
  return {
    ok: true,
    preview: {
      total: invoice_ids.length,
      sendable,
      sample: sendable[0] ?? null,
      skipped,
    },
  };
}
