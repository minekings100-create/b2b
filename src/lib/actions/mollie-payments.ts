"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { appBaseUrl } from "@/lib/email/transport";
import { getPaymentTransport } from "@/lib/payments/transport";

/**
 * Phase 6 — "Pay with iDEAL" flow for branch-visible invoices.
 *
 * 1. Caller clicks the Pay button on /invoices/[id].
 * 2. This action:
 *    - Validates the invoice is in a payable state (issued / overdue).
 *    - Calls the payment transport (mock today, Mollie later) to create
 *      a payment and get a checkout URL.
 *    - Stashes the provider payment id on `invoices.mollie_payment_id`
 *      and writes an audit row (`mollie_payment_created`).
 *    - Redirects the browser to the checkout URL.
 * 3. The user pays (or in mock mode, clicks a button). The provider
 *    calls the webhook at `/api/webhooks/mollie` with the result; the
 *    handler flips invoice.status to `paid` and records a `payments`
 *    row. See route handler for details.
 *
 * We DON'T use the admin client for the payable-state read — RLS lets
 * branch users read their own branch's invoices, which is exactly who
 * needs to initiate payment. Writes (mollie_payment_id stamp + audit)
 * use the admin client because `invoices_modify` is admin-only.
 */

const Input = z.object({ invoice_id: z.string().uuid() });

export type MolliePayState =
  | undefined
  | { ok: false; error: string };

export async function payInvoiceWithMollie(
  _prev: MolliePayState,
  formData: FormData,
): Promise<MolliePayState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const parsed = Input.safeParse({ invoice_id: formData.get("invoice_id") });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { invoice_id } = parsed.data;

  // Session client — RLS lets the branch user read their own invoice.
  const supabase = createClient();
  const { data: invoice, error: readErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, branch_id, total_gross_cents")
    .eq("id", invoice_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !invoice) {
    return { ok: false, error: "Invoice not found" };
  }
  if (invoice.status !== "issued" && invoice.status !== "overdue") {
    return {
      ok: false,
      error: `Cannot pay an invoice in status ${invoice.status}.`,
    };
  }
  if (invoice.total_gross_cents <= 0) {
    return { ok: false, error: "Invoice total is 0." };
  }

  const base = appBaseUrl();
  const transport = getPaymentTransport();
  const result = await transport.create({
    amount_cents: invoice.total_gross_cents,
    currency: "EUR",
    description: `${invoice.invoice_number}`,
    internal_reference: invoice.id,
    redirect_url: `${base}/invoices/${invoice.id}?paid=1`,
    webhook_url: `${base}/api/webhooks/mollie`,
  });

  // Persist the provider id on the invoice so we can reconcile on
  // webhook. Admin client — branch users don't have write access.
  const adm = createAdminClient();
  await adm
    .from("invoices")
    .update({ mollie_payment_id: result.provider_payment_id })
    .eq("id", invoice.id);

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: invoice.id,
    action: "mollie_payment_created",
    actor_user_id: session.user.id,
    before_json: { status: invoice.status } as Json,
    after_json: {
      status: invoice.status,
      provider: transport.name,
      provider_payment_id: result.provider_payment_id,
      amount_cents: invoice.total_gross_cents,
    } as unknown as Json,
  });

  redirect(result.checkout_url);
}
