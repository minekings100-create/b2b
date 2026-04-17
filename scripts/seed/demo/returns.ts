import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SeededOrder } from "./orders";
import { daysBefore, pad } from "./util";

type AdminClient = SupabaseClient<Database>;

export type SeededReturn = {
  id: string;
  rma_number: string;
  order_id: string;
  branch_id: string;
  status: "requested" | "received" | "processed";
  items: Array<{
    order_item_id: string;
    product_id: string;
    quantity: number;
    condition: "damaged" | "wrong_item" | "surplus" | "other";
    resolution: "refund" | "replace" | "credit_note" | null;
  }>;
};

/**
 * Exactly the three shapes the user called for:
 *   1. DEMO-RMA-0001 — status='requested'
 *   2. DEMO-RMA-0002 — status='received' with resolution='refund' on items
 *   3. DEMO-RMA-0003 — status='processed' with resolution='replace' on items
 */
export async function seedReturns(
  supabase: AdminClient,
  orders: SeededOrder[],
  now: Date,
): Promise<SeededReturn[]> {
  console.log("→ seeding returns + return_items");

  // Pick from delivered/closed orders — real RMA path.
  const pool = orders.filter((o) => o.status === "delivered" || o.status === "closed");
  if (pool.length < 3) {
    console.log(`  skipped (need ≥3 delivered/closed orders, have ${pool.length})`);
    return [];
  }

  const templates: Array<{
    rma_number: string;
    order: SeededOrder;
    status: "requested" | "received" | "processed";
    reason: string;
    notes: string | null;
    requested_days_ago: number;
    processed_days_ago: number | null;
    items: Array<{
      index: number;
      qty: number;
      condition: "damaged" | "wrong_item" | "surplus" | "other";
      resolution: "refund" | "replace" | "credit_note" | null;
    }>;
  }> = [
    {
      rma_number: `DEMO-RMA-${pad(1, 4)}`,
      order: pool[0]!,
      status: "requested",
      reason: "Two items arrived broken — photos attached.",
      notes: "Branch has retained damaged items pending approval.",
      requested_days_ago: 3,
      processed_days_ago: null,
      items: [
        { index: 0, qty: 2, condition: "damaged", resolution: null },
        { index: 1, qty: 1, condition: "damaged", resolution: null },
      ],
    },
    {
      rma_number: `DEMO-RMA-${pad(2, 4)}`,
      order: pool[1]!,
      status: "received",
      reason: "Wrong SKU on one pallet — expected 5L, received 1L.",
      notes: "Items back at HQ; refund pending admin confirmation.",
      requested_days_ago: 10,
      processed_days_ago: 2,
      items: [
        { index: 0, qty: 4, condition: "wrong_item", resolution: "refund" },
      ],
    },
    {
      rma_number: `DEMO-RMA-${pad(3, 4)}`,
      order: pool[2]!,
      status: "processed",
      reason: "Box damaged in transit.",
      notes: "Replacement order dispatched same day; original scrapped.",
      requested_days_ago: 18,
      processed_days_ago: 12,
      items: [
        { index: 0, qty: 1, condition: "damaged", resolution: "replace" },
        { index: 1, qty: 2, condition: "damaged", resolution: "replace" },
      ],
    },
  ];

  const headerInserts = templates.map((t) => ({
    rma_number: t.rma_number,
    order_id: t.order.id,
    branch_id: t.order.branch_id,
    requested_by_user_id: t.order.created_by_user_id,
    status: t.status,
    reason: t.reason,
    notes: t.notes,
    requested_at: daysBefore(now, t.requested_days_ago),
    processed_at: t.processed_days_ago != null ? daysBefore(now, t.processed_days_ago) : null,
  }));

  const { data: insertedReturns, error } = await supabase
    .from("returns")
    .insert(headerInserts)
    .select("id, rma_number, order_id, branch_id, status");
  if (error) throw error;
  const byNumber = new Map((insertedReturns ?? []).map((r) => [r.rma_number, r]));

  const itemInserts: Array<{
    return_id: string;
    order_item_id: string;
    quantity: number;
    condition: "damaged" | "wrong_item" | "surplus" | "other";
    resolution: "refund" | "replace" | "credit_note" | null;
  }> = [];
  for (const t of templates) {
    const r = byNumber.get(t.rma_number);
    if (!r) continue;
    for (const it of t.items) {
      const orderItem = t.order.items[it.index];
      if (!orderItem) continue;
      itemInserts.push({
        return_id: r.id,
        order_item_id: orderItem.id,
        quantity: Math.min(it.qty, orderItem.quantity_shipped || orderItem.quantity_requested),
        condition: it.condition,
        resolution: it.resolution,
      });
    }
  }

  if (itemInserts.length > 0) {
    const { error: itemErr } = await supabase.from("return_items").insert(itemInserts);
    if (itemErr) throw itemErr;
  }

  const out: SeededReturn[] = templates.map((t) => {
    const r = byNumber.get(t.rma_number)!;
    return {
      id: r.id,
      rma_number: t.rma_number,
      order_id: t.order.id,
      branch_id: t.order.branch_id,
      status: t.status,
      items: t.items.map((it) => ({
        order_item_id: t.order.items[it.index]!.id,
        product_id: t.order.items[it.index]!.product_id,
        quantity: it.qty,
        condition: it.condition,
        resolution: it.resolution,
      })),
    };
  });
  console.log(`  inserted ${out.length} returns (${itemInserts.length} return_items)`);
  return out;
}
