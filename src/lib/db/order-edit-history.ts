import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 3.4 — loader for `<OrderEditHistory>`.
 *
 * Returns rows for the given order newest-first, with actor email
 * resolved. RLS on `order_edit_history` gates cross-branch reads.
 */

export type OrderEditHistoryLineSnapshot = {
  product_id: string;
  sku: string;
  name: string;
  quantity_requested: number;
  unit_price_cents_snapshot: number;
  vat_rate_snapshot: number;
  line_net_cents: number;
};

export type OrderEditHistoryEntry = {
  id: string;
  edited_at: string;
  edited_by_user_id: string | null;
  edited_by_email: string | null;
  edit_reason: string | null;
  before_items: OrderEditHistoryLineSnapshot[];
  after_items: OrderEditHistoryLineSnapshot[];
};

function itemsFromSnapshot(
  snapshot: unknown,
): OrderEditHistoryLineSnapshot[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const obj = snapshot as { items?: unknown };
  if (!Array.isArray(obj.items)) return [];
  return obj.items.filter(
    (i): i is OrderEditHistoryLineSnapshot =>
      i !== null &&
      typeof i === "object" &&
      typeof (i as { product_id?: unknown }).product_id === "string",
  );
}

export async function fetchOrderEditHistory(
  orderId: string,
): Promise<OrderEditHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_edit_history")
    .select("id, edited_at, edited_by_user_id, edit_reason, before_snapshot, after_snapshot")
    .eq("order_id", orderId)
    .order("edited_at", { ascending: false });
  if (error) throw new Error(`fetchOrderEditHistory: ${error.message}`);

  const actorIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.edited_by_user_id)
        .filter((x): x is string => typeof x === "string"),
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

  return (data ?? []).map((r) => ({
    id: r.id,
    edited_at: r.edited_at,
    edited_by_user_id: r.edited_by_user_id,
    edited_by_email: r.edited_by_user_id
      ? (emails.get(r.edited_by_user_id) ?? null)
      : null,
    edit_reason: r.edit_reason,
    before_items: itemsFromSnapshot(r.before_snapshot),
    after_items: itemsFromSnapshot(r.after_snapshot),
  }));
}
