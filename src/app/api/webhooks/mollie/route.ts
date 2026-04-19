import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 6 — Mollie webhook (mock flavour).
 *
 * Real Mollie posts a form-encoded body with a single `id` field; the
 * handler fetches the payment from their API to confirm status. Our
 * mock transport POSTs with the full shape already so we can skip the
 * round-trip while still exercising the same DB-side logic.
 *
 * **PAUSE gate (documented in PR):** signature verification is NOT
 * implemented here. Real Mollie signs webhook calls; that code lands
 * when real credentials land — per the Phase 6 PAUSE rules. This mock
 * handler trusts the body; it's only reachable in dev because prod
 * would have an unpublished URL anyway, and the mock /checkout page
 * is the only in-app caller.
 *
 * Behaviour:
 *   - status=paid → flip invoice.status from issued/overdue to paid,
 *     record a `payments` row, write an audit row.
 *   - any other status → audit row + no invoice change (the caller
 *     can retry or resolve via manual mark-paid).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  payment_id: z.string().min(1),
  /** Invoice id — our internal_reference. */
  reference: z.string().uuid().optional(),
  /** Mock flavour: "paid" / "failed" / "canceled" / "expired". Real
   *  Mollie posts just an id; we'd fetch their API to learn status. */
  status: z
    .enum(["paid", "failed", "canceled", "expired"])
    .default("paid"),
});

async function handle(req: Request): Promise<Response> {
  // Real Mollie posts form-urlencoded. Mock transport posts JSON.
  // Accept both.
  let raw: Record<string, unknown> = {};
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      raw = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) raw[k] = v;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { payment_id, reference, status } = parsed.data;

  const adm = createAdminClient();
  // Find the invoice either by reference (preferred) or by the
  // stashed payment id. Either way, we need a known-good target.
  let invoiceQuery = adm
    .from("invoices")
    .select(
      "id, invoice_number, status, total_gross_cents, mollie_payment_id, order_id",
    )
    .eq("mollie_payment_id", payment_id)
    .is("deleted_at", null);
  if (reference) {
    invoiceQuery = adm
      .from("invoices")
      .select(
        "id, invoice_number, status, total_gross_cents, mollie_payment_id, order_id",
      )
      .eq("id", reference)
      .is("deleted_at", null);
  }
  const { data: invoice } = await invoiceQuery.maybeSingle();
  if (!invoice) {
    return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
  }

  // Audit the webhook receipt regardless of outcome — useful when
  // reconciling "Mollie says paid but portal says issued" disputes.
  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: invoice.id,
    action: "mollie_webhook_received",
    actor_user_id: null,
    before_json: { status: invoice.status } as Json,
    after_json: {
      provider_payment_id: payment_id,
      provider_status: status,
    } as unknown as Json,
  });

  if (status !== "paid") {
    return NextResponse.json({
      ok: true,
      acted: false,
      status: invoice.status,
    });
  }

  // Idempotent: if the invoice is already paid, do nothing (the
  // payments row was written on the first successful webhook).
  if (invoice.status === "paid") {
    return NextResponse.json({ ok: true, acted: false, status: "paid" });
  }
  if (invoice.status !== "issued" && invoice.status !== "overdue") {
    return NextResponse.json({
      ok: true,
      acted: false,
      status: invoice.status,
    });
  }

  const paidAt = new Date().toISOString();
  const { data: updated } = await adm
    .from("invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_method: "ideal_mollie",
    })
    .eq("id", invoice.id)
    .in("status", ["issued", "overdue"])
    .select("id")
    .maybeSingle();
  if (!updated) {
    // Raced — another webhook or a manual action beat us. Still OK.
    return NextResponse.json({ ok: true, acted: false, status: "raced" });
  }

  await adm.from("payments").insert({
    invoice_id: invoice.id,
    amount_cents: invoice.total_gross_cents,
    paid_at: paidAt,
    method: "ideal_mollie",
    reference: payment_id,
    recorded_by_user_id: null,
  });

  await adm.from("audit_log").insert({
    entity_type: "invoice",
    entity_id: invoice.id,
    action: "invoice_paid",
    actor_user_id: null,
    before_json: { status: invoice.status } as Json,
    after_json: {
      status: "paid",
      invoice_number: invoice.invoice_number,
      method: "ideal_mollie",
      reference: payment_id,
      amount_cents: invoice.total_gross_cents,
    } as unknown as Json,
  });

  return NextResponse.json({ ok: true, acted: true, status: "paid" });
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
