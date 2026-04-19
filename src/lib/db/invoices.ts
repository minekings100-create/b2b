import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Phase 5 — invoice list + detail loaders.
 *
 * RLS already narrows reads to admin/super globally + branch scopes.
 * Callers render at `/invoices` + `/invoices/[id]` + `/orders/[id]`.
 */

type Status = Database["public"]["Enums"]["invoice_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "paid",
  "overdue",
  "cancelled",
] as const satisfies readonly Status[];

export type InvoiceListRow = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  status: Status;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  total_gross_cents: number;
};

export async function fetchVisibleInvoices(
  statusFilter?: Status | null,
): Promise<InvoiceListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("invoices")
    .select(
      `
        id, invoice_number, branch_id, status,
        issued_at, due_at, paid_at, total_gross_cents,
        order_id,
        branches:branch_id ( branch_code, name ),
        orders:order_id ( order_number )
      `,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) throw new Error(`fetchVisibleInvoices: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    order_id: r.order_id,
    order_number: r.orders?.order_number ?? null,
    branch_id: r.branch_id,
    branch_code: r.branches?.branch_code ?? "—",
    branch_name: r.branches?.name ?? "—",
    status: r.status,
    issued_at: r.issued_at,
    due_at: r.due_at,
    paid_at: r.paid_at,
    total_gross_cents: r.total_gross_cents,
  }));
}

export type InvoiceDetailLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  line_net_cents: number;
  line_vat_cents: number;
};

export type InvoicePaymentRow = {
  id: string;
  amount_cents: number;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
  recorded_by_email: string | null;
};

export type InvoiceTimelineEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  after_json: Json | null;
};

export type InvoiceDetail = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  status: Status;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  mollie_payment_id: string | null;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  lines: InvoiceDetailLine[];
  payments: InvoicePaymentRow[];
  timeline: InvoiceTimelineEntry[];
};

export async function fetchInvoiceDetail(
  id: string,
): Promise<InvoiceDetail | null> {
  const supabase = createClient();
  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      `
        id, invoice_number, branch_id, order_id, status,
        issued_at, due_at, paid_at, payment_method, mollie_payment_id,
        total_net_cents, total_vat_cents, total_gross_cents,
        branches:branch_id ( branch_code, name ),
        orders:order_id ( order_number ),
        invoice_items (
          id, description, quantity, unit_price_cents,
          vat_rate, line_net_cents, line_vat_cents
        )
      `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`fetchInvoiceDetail: ${error.message}`);
  if (!inv) return null;

  // Payments — ledger of everything applied against this invoice.
  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount_cents, paid_at, method, reference, recorded_by_user_id",
    )
    .eq("invoice_id", id)
    .order("paid_at", { ascending: true });

  // Audit timeline — same pattern as order-detail.
  const { data: audit } = await supabase
    .from("audit_log")
    .select("id, action, actor_user_id, after_json, created_at")
    .eq("entity_type", "invoice")
    .eq("entity_id", id)
    .order("created_at", { ascending: true });

  const actorIds = Array.from(
    new Set(
      [
        ...(audit ?? []).map((a) => a.actor_user_id),
        ...(payments ?? []).map((p) => p.recorded_by_user_id),
      ].filter((x): x is string => typeof x === "string"),
    ),
  );
  const emails = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", actorIds);
    for (const u of users ?? []) emails.set(u.id, u.email);
  }

  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    order_id: inv.order_id,
    order_number: inv.orders?.order_number ?? null,
    branch_id: inv.branch_id,
    branch_code: inv.branches?.branch_code ?? "—",
    branch_name: inv.branches?.name ?? "—",
    status: inv.status,
    issued_at: inv.issued_at,
    due_at: inv.due_at,
    paid_at: inv.paid_at,
    payment_method: inv.payment_method,
    mollie_payment_id: inv.mollie_payment_id,
    total_net_cents: inv.total_net_cents,
    total_vat_cents: inv.total_vat_cents,
    total_gross_cents: inv.total_gross_cents,
    lines: (inv.invoice_items ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
      line_net_cents: l.line_net_cents,
      line_vat_cents: l.line_vat_cents,
    })),
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      amount_cents: p.amount_cents,
      paid_at: p.paid_at,
      method: p.method,
      reference: p.reference,
      recorded_by_email: p.recorded_by_user_id
        ? (emails.get(p.recorded_by_user_id) ?? null)
        : null,
    })),
    timeline: (audit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor_email: a.actor_user_id
        ? (emails.get(a.actor_user_id) ?? null)
        : null,
      created_at: a.created_at,
      after_json: a.after_json,
    })),
  };
}

/**
 * Returns the "open" invoice (not cancelled / paid) attached to an
 * order, or null. Used by the order detail page to surface a link to
 * the existing invoice instead of offering to create a duplicate.
 */
export async function fetchOpenInvoiceForOrder(
  orderId: string,
): Promise<{ id: string; invoice_number: string; status: Status } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("order_id", orderId)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
