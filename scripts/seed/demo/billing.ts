import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SeededOrder } from "./orders";
import { daysAfter, daysBefore, pad, pickOne, seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;

export type SeededInvoice = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  branch_id: string;
  status: "draft" | "issued" | "paid" | "overdue" | "cancelled";
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_method: "manual_bank_transfer" | "ideal_mollie" | "credit_note" | "other" | null;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
};

type UserLite = { id: string; email: string };

/**
 * Distribution: every status gets a handful of invoices so each admin
 * invoice-queue filter shows something.
 */
const INVOICE_DISTRIBUTION: Array<{
  status: SeededInvoice["status"];
  count: number;
  /** Which order statuses to pull from. */
  fromOrderStatuses: Array<SeededOrder["status"]>;
}> = [
  { status: "draft",     count: 3, fromOrderStatuses: ["shipped"] },
  { status: "issued",    count: 3, fromOrderStatuses: ["delivered"] },
  { status: "paid",      count: 3, fromOrderStatuses: ["closed", "delivered"] },
  { status: "overdue",   count: 3, fromOrderStatuses: ["delivered", "shipped"] },
  { status: "cancelled", count: 2, fromOrderStatuses: ["cancelled"] },
];

export async function seedInvoices(
  supabase: AdminClient,
  orders: SeededOrder[],
  adminUsers: UserLite[],
  now: Date,
): Promise<SeededInvoice[]> {
  console.log("→ seeding invoices + items + payments");
  const rand = seedRand(59);

  const byStatus = new Map<SeededOrder["status"], SeededOrder[]>();
  for (const o of orders) {
    const list = byStatus.get(o.status) ?? [];
    list.push(o);
    byStatus.set(o.status, list);
  }

  const invoicePlans: Array<{
    invoice_number: string;
    branch_id: string;
    order_id: string;
    order_number: string;
    status: SeededInvoice["status"];
    issued_at: string | null;
    due_at: string | null;
    paid_at: string | null;
    payment_method: SeededInvoice["payment_method"];
    total_net_cents: number;
    total_vat_cents: number;
    total_gross_cents: number;
    mollie_payment_id: string | null;
    pdf_path: string | null;
    items: Array<{
      description: string;
      quantity: number;
      unit_price_cents: number;
      vat_rate: number;
      line_net_cents: number;
      line_vat_cents: number;
    }>;
  }> = [];

  let counter = 1;
  const paymentMethodCycle: Array<NonNullable<SeededInvoice["payment_method"]>> = [
    "manual_bank_transfer",
    "ideal_mollie",
    "credit_note",
  ];
  let paidMethodIdx = 0;

  for (const bucket of INVOICE_DISTRIBUTION) {
    const pool = bucket.fromOrderStatuses.flatMap((s) => byStatus.get(s) ?? []);
    for (let i = 0; i < bucket.count; i++) {
      if (pool.length === 0) break;
      const order = pool[i % pool.length]!;

      // Build items from the order's line items. Snapshot the price + vat.
      // Every 3rd invoice uses mixed VAT rates (swap a handful of lines to
      // 9%) so the UI shows a rate mix.
      const mixVat = i % 3 === 0;
      const items = order.items.map((it, idx) => {
        const vat = mixVat && idx % 4 === 0 ? 9 : it.vat_rate_snapshot;
        const net = it.line_net_cents;
        const vatCents = Math.round((net * vat) / 100);
        return {
          description: `SKU line ${pad(idx + 1, 2)}`,
          quantity: it.quantity_shipped > 0 ? it.quantity_shipped : it.quantity_approved ?? it.quantity_requested,
          unit_price_cents: it.unit_price_cents_snapshot,
          vat_rate: vat,
          line_net_cents: net,
          line_vat_cents: vatCents,
        };
      });
      const totalNet = items.reduce((a, b) => a + b.line_net_cents, 0);
      const totalVat = items.reduce((a, b) => a + b.line_vat_cents, 0);
      const totalGross = totalNet + totalVat;

      // Timeline.
      let issuedAt: string | null = null;
      let dueAt: string | null = null;
      let paidAt: string | null = null;
      let paymentMethod: SeededInvoice["payment_method"] = null;
      let molliePaymentId: string | null = null;

      const branchTerm = 14;
      if (bucket.status === "draft") {
        // Not issued yet.
      } else if (bucket.status === "issued") {
        const issuedDaysAgo = 2 + Math.floor(rand() * 5);
        issuedAt = daysBefore(now, issuedDaysAgo);
        dueAt = daysAfter(new Date(issuedAt), branchTerm);
      } else if (bucket.status === "overdue") {
        const issuedDaysAgo = branchTerm + 5 + Math.floor(rand() * 20);
        issuedAt = daysBefore(now, issuedDaysAgo);
        dueAt = daysAfter(new Date(issuedAt), branchTerm);
      } else if (bucket.status === "paid") {
        const issuedDaysAgo = 10 + Math.floor(rand() * 20);
        issuedAt = daysBefore(now, issuedDaysAgo);
        dueAt = daysAfter(new Date(issuedAt), branchTerm);
        paidAt = daysBefore(now, Math.max(1, issuedDaysAgo - 3 - Math.floor(rand() * 5)));
        paymentMethod = paymentMethodCycle[paidMethodIdx % paymentMethodCycle.length]!;
        paidMethodIdx += 1;
        if (paymentMethod === "ideal_mollie") {
          molliePaymentId = `tr_demo${pad(counter, 6)}`;
        }
      } else if (bucket.status === "cancelled") {
        const issuedDaysAgo = 5 + Math.floor(rand() * 10);
        issuedAt = daysBefore(now, issuedDaysAgo);
        dueAt = daysAfter(new Date(issuedAt), branchTerm);
      }

      invoicePlans.push({
        invoice_number: `DEMO-INV-${pad(counter, 4)}`,
        branch_id: order.branch_id,
        order_id: order.id,
        order_number: order.order_number,
        status: bucket.status,
        issued_at: issuedAt,
        due_at: dueAt,
        paid_at: paidAt,
        payment_method: paymentMethod,
        mollie_payment_id: molliePaymentId,
        pdf_path: bucket.status === "draft" ? null : `invoices/demo/${pad(counter, 4)}.pdf`,
        total_net_cents: totalNet,
        total_vat_cents: totalVat,
        total_gross_cents: totalGross,
        items,
      });
      counter += 1;
    }
  }

  // Insert invoice headers.
  const headerInserts = invoicePlans.map((p) => ({
    invoice_number: p.invoice_number,
    order_id: p.order_id,
    branch_id: p.branch_id,
    issued_at: p.issued_at,
    due_at: p.due_at,
    total_net_cents: p.total_net_cents,
    total_vat_cents: p.total_vat_cents,
    total_gross_cents: p.total_gross_cents,
    status: p.status,
    paid_at: p.paid_at,
    payment_method: p.payment_method,
    mollie_payment_id: p.mollie_payment_id,
    pdf_path: p.pdf_path,
  }));

  const { data: insertedInvoices, error: invErr } = await supabase
    .from("invoices")
    .insert(headerInserts)
    .select("id, invoice_number, order_id, branch_id, status, issued_at, due_at, paid_at, payment_method, total_net_cents, total_vat_cents, total_gross_cents");
  if (invErr) throw invErr;
  const invoiceByNumber = new Map(
    (insertedInvoices ?? []).map((i) => [i.invoice_number, i]),
  );

  // Insert invoice_items.
  const itemInserts: Array<{
    invoice_id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    vat_rate: number;
    line_net_cents: number;
    line_vat_cents: number;
  }> = [];
  for (const plan of invoicePlans) {
    const inv = invoiceByNumber.get(plan.invoice_number);
    if (!inv) continue;
    for (const it of plan.items) {
      itemInserts.push({ invoice_id: inv.id, ...it });
    }
  }
  for (let i = 0; i < itemInserts.length; i += 200) {
    const chunk = itemInserts.slice(i, i + 200);
    const { error } = await supabase.from("invoice_items").insert(chunk);
    if (error) throw error;
  }

  // Insert payments for the `paid` invoices.
  const paymentInserts: Array<{
    invoice_id: string;
    amount_cents: number;
    paid_at: string;
    method: NonNullable<SeededInvoice["payment_method"]>;
    reference: string | null;
    recorded_by_user_id: string | null;
  }> = [];
  for (const plan of invoicePlans) {
    if (plan.status !== "paid" || !plan.paid_at || !plan.payment_method) continue;
    const inv = invoiceByNumber.get(plan.invoice_number);
    if (!inv) continue;
    paymentInserts.push({
      invoice_id: inv.id,
      amount_cents: plan.total_gross_cents,
      paid_at: plan.paid_at,
      method: plan.payment_method,
      reference:
        plan.payment_method === "ideal_mollie"
          ? plan.mollie_payment_id
          : plan.payment_method === "manual_bank_transfer"
            ? `IBAN receipt ${pad(counter, 4)}`
            : "Credit note balance applied",
      recorded_by_user_id: adminUsers.length > 0 ? pickOne(seedRand(77), adminUsers).id : null,
    });
  }
  if (paymentInserts.length > 0) {
    const { error } = await supabase.from("payments").insert(paymentInserts);
    if (error) throw error;
  }

  const out: SeededInvoice[] = invoicePlans.map((p) => {
    const inv = invoiceByNumber.get(p.invoice_number)!;
    return {
      id: inv.id,
      invoice_number: p.invoice_number,
      order_id: p.order_id,
      order_number: p.order_number,
      branch_id: p.branch_id,
      status: p.status,
      issued_at: p.issued_at,
      due_at: p.due_at,
      paid_at: p.paid_at,
      payment_method: p.payment_method,
      total_net_cents: p.total_net_cents,
      total_vat_cents: p.total_vat_cents,
      total_gross_cents: p.total_gross_cents,
    };
  });
  console.log(
    `  inserted ${out.length} invoices (${itemInserts.length} items, ${paymentInserts.length} payments)`,
  );
  return out;
}
