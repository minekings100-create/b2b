import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export type OutstandingInvoiceSummary = {
  count: number;
  total_cents: number;
};

/**
 * Count overdue/issued invoices whose due date has already passed for a
 * given branch. Feeds SPEC §8.1 step 4's block-and-confirm modal.
 */
export async function fetchOutstandingInvoicesForBranch(
  supabase: Client,
  branchId: string,
): Promise<OutstandingInvoiceSummary> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("invoices")
    .select("total_gross_cents")
    .eq("branch_id", branchId)
    .in("status", ["issued", "overdue"])
    .lt("due_at", nowIso)
    .is("deleted_at", null);
  if (error) throw error;

  const rows = data ?? [];
  const total = rows.reduce(
    (acc, r) => acc + Number(r.total_gross_cents ?? 0),
    0,
  );
  return { count: rows.length, total_cents: total };
}

/**
 * Allocate the next yearly sequential order number through the existing
 * `allocate_sequence` SQL function (gap-less, transaction-safe).
 */
export async function allocateOrderNumber(
  supabase: Client,
  at: Date = new Date(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const { data, error } = await supabase.rpc("allocate_sequence", {
    p_key: `orders_${year}`,
  });
  if (error) throw error;
  const next = Number(data ?? 0);
  return `ORD-${year}-${String(next).padStart(4, "0")}`;
}

/**
 * Recompute `orders.total_*` from its current `order_items`. Called after
 * every cart mutation so the header totals stay authoritative.
 */
export async function recomputeOrderTotals(
  supabase: Client,
  orderId: string,
): Promise<{ net: number; vat: number; gross: number }> {
  const { data, error } = await supabase
    .from("order_items")
    .select("line_net_cents, vat_rate_snapshot")
    .eq("order_id", orderId);
  if (error) throw error;

  let net = 0;
  let vat = 0;
  for (const row of data ?? []) {
    const lineNet = Number(row.line_net_cents ?? 0);
    net += lineNet;
    vat += Math.round((lineNet * row.vat_rate_snapshot) / 100);
  }
  const gross = net + vat;

  const { error: updErr } = await supabase
    .from("orders")
    .update({
      total_net_cents: net,
      total_vat_cents: vat,
      total_gross_cents: gross,
    })
    .eq("id", orderId);
  if (updErr) throw updErr;

  return { net, vat, gross };
}
