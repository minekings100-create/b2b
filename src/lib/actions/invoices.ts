"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";
import { managersForBranch } from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import { renderInvoiceIssued } from "@/lib/email/templates";

/**
 * Phase 5 — invoice lifecycle server actions.
 *
 * All mutations are admin-only (super_admin / administration). RLS
 * already enforces this at the Postgres layer; the role check here
 * returns a friendly error rather than a 500 from RLS.
 *
 * State machine (SPEC §7): `draft → issued → paid`, plus cron
 * `issued → overdue`, plus admin `→ cancelled`. `cancelled` is a
 * terminal state. Reopening a cancelled invoice is explicitly out of
 * scope — create a new draft instead.
 */

export type InvoiceActionState =
  | undefined
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

const OrderIdInput = z.object({ order_id: z.string().uuid() });
const InvoiceIdInput = z.object({ invoice_id: z.string().uuid() });
const MarkPaidInput = z.object({
  invoice_id: z.string().uuid(),
  method: z.enum(["manual_bank_transfer", "credit_note", "other"]),
  reference: z.string().max(200).optional().default(""),
});

/** Payment terms in calendar days. SPEC §3 + §8.6 give no hard number;
 *  30 calendar days is standard Dutch B2B ("Net 30"). Working-days
 *  helper is reused elsewhere for approval timeouts; invoices keep
 *  calendar math so Branch users + admins both reason about the same
 *  wall-clock deadline. */
const PAYMENT_TERM_DAYS = 30;

async function requireAdmin() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return null;
  return session;
}

/**
 * Allocate INV-YYYY-NNNNN through the existing gap-less per-year
 * sequence helper. Same pattern as orders + pallets.
 */
async function allocateInvoiceNumber(
  adm: ReturnType<typeof createAdminClient>,
  at: Date = new Date(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const { data, error } = await adm.rpc("allocate_sequence", {
    p_key: `invoices_${year}`,
  });
  if (error) throw new Error(`allocate_sequence invoices: ${error.message}`);
  return `INV-${year}-${String(data ?? 0).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// createDraftInvoiceFromOrder
// ---------------------------------------------------------------------------

/**
 * Admin flow: create a draft invoice from a fulfilled order. Once
 * shipping (Phase 4.1) lands this will also be called automatically
 * on `packed → shipped`; for now it's a manual button on the order
 * detail page so admins can invoice orders that have been packed.
 *
 * Guards:
 *   - order must be in a fulfilment stage (packed / shipped / delivered
 *     / closed) — refuse to invoice something that never left the warehouse
 *   - no other non-cancelled invoice may exist for the order (1:1)
 */
export async function createDraftInvoiceFromOrder(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Administrator role required" };
  const parsed = OrderIdInput.safeParse({
    order_id: formData.get("order_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { order_id } = parsed.data;

  const adm = createAdminClient();

  const { data: order } = await adm
    .from("orders")
    .select(
      `
        id, order_number, branch_id, status,
        total_net_cents, total_vat_cents, total_gross_cents,
        order_items (
          id, quantity_approved, unit_price_cents_snapshot, vat_rate_snapshot,
          line_net_cents,
          products:product_id ( sku, name )
        )
      `,
    )
    .eq("id", order_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };

  const invoiceable: Array<Database["public"]["Enums"]["order_status"]> = [
    "packed",
    "shipped",
    "delivered",
    "closed",
  ];
  if (!invoiceable.includes(order.status)) {
    return {
      ok: false,
      error: `Order status is ${order.status} — invoice can only be created from a fulfilled order.`,
    };
  }

  const { data: existing } = await adm
    .from("invoices")
    .select("id, status")
    .eq("order_id", order_id)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `An invoice already exists for this order (status ${existing.status}).`,
    };
  }

  const invoiceNumber = await allocateInvoiceNumber(adm);

  // Snapshot lines: one invoice_items row per approved order line with
  // positive quantity. Description denormalises `SKU · name` so future
  // product renames don't rewrite issued invoices.
  const linesData = (order.order_items ?? []).filter(
    (i) => (i.quantity_approved ?? 0) > 0,
  );
  const totalNet = linesData.reduce(
    (sum, l) => sum + l.line_net_cents,
    0,
  );
  const totalVat = linesData.reduce(
    (sum, l) =>
      sum + Math.round((l.line_net_cents * l.vat_rate_snapshot) / 100),
    0,
  );
  const totalGross = totalNet + totalVat;

  const { data: invoice, error: invErr } = await adm
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      order_id,
      branch_id: order.branch_id,
      status: "draft",
      total_net_cents: totalNet,
      total_vat_cents: totalVat,
      total_gross_cents: totalGross,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: invErr?.message ?? "Failed to create invoice",
    };
  }

  if (linesData.length > 0) {
    const { error: itemsErr } = await adm.from("invoice_items").insert(
      linesData.map((l) => ({
        invoice_id: invoice.id,
        description: `${l.products?.sku ?? ""} · ${l.products?.name ?? ""}`.trim(),
        quantity: l.quantity_approved ?? 0,
        unit_price_cents: l.unit_price_cents_snapshot,
        vat_rate: l.vat_rate_snapshot,
        line_net_cents: l.line_net_cents,
        line_vat_cents: Math.round(
          (l.line_net_cents * l.vat_rate_snapshot) / 100,
        ),
      })),
    );
    if (itemsErr) {
      return { ok: false, error: itemsErr.message };
    }
  }

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: invoice.id,
    action: "invoice_draft_created",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      invoice_number: invoiceNumber,
      order_id,
      order_number: order.order_number,
      total_gross_cents: totalGross,
    } as unknown as Json,
  });

  revalidatePath("/invoices");
  revalidatePath(`/orders/${order_id}`);
  // Hand-off to the new invoice's detail page — matches the
  // editOrder pattern (redirect() throws NEXT_REDIRECT past
  // useFormState's wrapper so the client follows the nav).
  redirect(`/invoices/${invoice.id}`);
}

// ---------------------------------------------------------------------------
// issueInvoice
// ---------------------------------------------------------------------------

export async function issueInvoice(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Administrator role required" };
  const parsed = InvoiceIdInput.safeParse({
    invoice_id: formData.get("invoice_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("invoices")
    .select("id, invoice_number, status, branch_id, order_id, total_gross_cents")
    .eq("id", parsed.data.invoice_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Invoice not found" };
  if (current.status !== "draft") {
    return {
      ok: false,
      error: `Only draft invoices can be issued (was ${current.status}).`,
    };
  }

  const issuedAt = new Date();
  const dueAt = new Date(issuedAt);
  dueAt.setUTCDate(dueAt.getUTCDate() + PAYMENT_TERM_DAYS);

  // Status-guarded UPDATE — catches the narrow window between our
  // read and write (e.g. two admins racing the Issue button).
  const { data: updated } = await adm
    .from("invoices")
    .update({
      status: "issued",
      issued_at: issuedAt.toISOString(),
      due_at: dueAt.toISOString(),
    })
    .eq("id", current.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Invoice state changed under you — refresh and try again.",
    };
  }

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: current.id,
    action: "invoice_issued",
    actor_user_id: session.user.id,
    before_json: { status: "draft" } as Json,
    after_json: {
      status: "issued",
      invoice_number: current.invoice_number,
      issued_at: issuedAt.toISOString(),
      due_at: dueAt.toISOString(),
      total_gross_cents: current.total_gross_cents,
    } as unknown as Json,
  });

  // Email the branch managers. The in-app bell also gets a row via
  // notify() so the recipient sees the invoice on their next poll.
  await emitInvoiceIssued({
    invoiceId: current.id,
    invoiceNumber: current.invoice_number,
    branchId: current.branch_id,
    orderId: current.order_id,
    totalGrossCents: current.total_gross_cents,
    dueAtIso: dueAt.toISOString(),
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] invoice_issued side-effect failed for ${current.invoice_number}: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${current.id}`);
  if (current.order_id) revalidatePath(`/orders/${current.order_id}`);
  return { ok: true, message: "Invoice issued" };
}

async function emitInvoiceIssued(opts: {
  invoiceId: string;
  invoiceNumber: string;
  branchId: string;
  orderId: string | null;
  totalGrossCents: number;
  dueAtIso: string;
}): Promise<void> {
  const adm = createAdminClient();
  const recipients = await managersForBranch(adm, opts.branchId);
  if (recipients.length === 0) return;
  const { data: branch } = await adm
    .from("branches")
    .select("branch_code, name")
    .eq("id", opts.branchId)
    .maybeSingle();
  let orderNumber: string | null = null;
  if (opts.orderId) {
    const { data: order } = await adm
      .from("orders")
      .select("order_number")
      .eq("id", opts.orderId)
      .maybeSingle();
    orderNumber = order?.order_number ?? null;
  }
  const rendered = renderInvoiceIssued({
    invoice_id: opts.invoiceId,
    invoice_number: opts.invoiceNumber,
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
    order_number: orderNumber,
    total_gross_cents: opts.totalGrossCents,
    due_at: opts.dueAtIso,
  });
  await notify({
    db: adm,
    type: "invoice_issued",
    recipients,
    rendered,
    payload: {
      invoice_id: opts.invoiceId,
      invoice_number: opts.invoiceNumber,
      branch_code: branch?.branch_code ?? null,
      due_at: opts.dueAtIso,
      total_gross_cents: opts.totalGrossCents,
      href: `/invoices/${opts.invoiceId}`,
    },
  });
}

// ---------------------------------------------------------------------------
// markInvoicePaid
// ---------------------------------------------------------------------------

/**
 * Admin-confirmed manual payment. NOT a real-money mutation — it's
 * bookkeeping: admin has confirmed receipt of a bank transfer or
 * applied a credit note and flips the invoice to `paid`. Mollie's
 * webhook-driven `paid` transition is Phase 6 and is intentionally
 * separate (cron gate trigger applies to that path, not this one).
 */
export async function markInvoicePaid(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Administrator role required" };
  const parsed = MarkPaidInput.safeParse({
    invoice_id: formData.get("invoice_id"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { invoice_id, method, reference } = parsed.data;

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("invoices")
    .select("id, invoice_number, status, total_gross_cents, order_id")
    .eq("id", invoice_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Invoice not found" };
  const payable: ReadonlyArray<Database["public"]["Enums"]["invoice_status"]> = [
    "issued",
    "overdue",
  ];
  if (!payable.includes(current.status)) {
    return {
      ok: false,
      error: `Cannot mark paid from status ${current.status}.`,
    };
  }

  const paidAt = new Date().toISOString();

  const { data: updated } = await adm
    .from("invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_method: method,
    })
    .eq("id", current.id)
    .in("status", payable)
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Invoice state changed under you — refresh and try again.",
    };
  }

  const { error: paymentErr } = await adm.from("payments").insert({
    invoice_id: current.id,
    amount_cents: current.total_gross_cents,
    paid_at: paidAt,
    method,
    reference: reference || null,
    recorded_by_user_id: session.user.id,
  });
  if (paymentErr) {
    // Invoice header is now in `paid` state but the ledger row failed.
    // Best-effort — log and continue; admin can re-record manually.
    // eslint-disable-next-line no-console
    console.error(`[invoices] payment insert failed: ${paymentErr.message}`);
  }

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: current.id,
    action: "invoice_paid",
    actor_user_id: session.user.id,
    before_json: { status: current.status } as Json,
    after_json: {
      status: "paid",
      invoice_number: current.invoice_number,
      method,
      reference: reference || null,
      amount_cents: current.total_gross_cents,
    } as unknown as Json,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${current.id}`);
  if (current.order_id) revalidatePath(`/orders/${current.order_id}`);
  return { ok: true, message: "Invoice marked paid" };
}

// ---------------------------------------------------------------------------
// cancelInvoice
// ---------------------------------------------------------------------------

export async function cancelInvoice(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Administrator role required" };
  const parsed = InvoiceIdInput.safeParse({
    invoice_id: formData.get("invoice_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("invoices")
    .select("id, invoice_number, status, order_id")
    .eq("id", parsed.data.invoice_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Invoice not found" };
  // Cancel applies to issued+ invoices only — drafts map to a fulfilled
  // order and aren't discardable. The UI on /invoices/[id] doesn't
  // render the Cancel button for drafts; this server-side gate is
  // defence-in-depth against a crafted POST. See BACKLOG Phase 5
  // entry "Cancel button should not appear on drafts".
  const cancellable: ReadonlyArray<
    Database["public"]["Enums"]["invoice_status"]
  > = ["issued", "overdue"];
  if (!cancellable.includes(current.status)) {
    return {
      ok: false,
      error:
        current.status === "draft"
          ? "Drafts cannot be cancelled — they belong to a fulfilled order. Issue the invoice instead."
          : `Cannot cancel an invoice in status ${current.status}.`,
    };
  }

  const { data: updated } = await adm
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", current.id)
    .in("status", cancellable)
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Invoice state changed under you — refresh and try again.",
    };
  }

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: current.id,
    action: "invoice_cancelled",
    actor_user_id: session.user.id,
    before_json: { status: current.status } as Json,
    after_json: {
      status: "cancelled",
      invoice_number: current.invoice_number,
    } as unknown as Json,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${current.id}`);
  if (current.order_id) revalidatePath(`/orders/${current.order_id}`);
  return { ok: true, message: "Invoice cancelled" };
}
