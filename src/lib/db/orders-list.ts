import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type OrderSummary = {
  id: string;
  order_number: string;
  branch_code: string;
  created_by_email: string | null;
  status: Database["public"]["Enums"]["order_status"];
  submitted_at: string | null;
  created_at: string;
  total_gross_cents: number;
  item_count: number;
};

type Raw = {
  id: string;
  order_number: string;
  status: Database["public"]["Enums"]["order_status"];
  created_at: string;
  submitted_at: string | null;
  total_gross_cents: number;
  branches: { branch_code: string } | { branch_code: string }[] | null;
  users: { email: string } | { email: string }[] | null;
  order_items: { count: number }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Fetch the caller's visible orders (RLS handles scoping per SPEC §5).
 * Drafts included so branch users can find their in-progress cart.
 */
export async function fetchVisibleOrders(): Promise<OrderSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, created_at, submitted_at, total_gross_cents,
       branches ( branch_code ),
       users!orders_created_by_user_id_fkey ( email ),
       order_items ( count )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    branch_code: one(row.branches)?.branch_code ?? "—",
    created_by_email: one(row.users)?.email ?? null,
    status: row.status,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    total_gross_cents: row.total_gross_cents,
    item_count: row.order_items?.[0]?.count ?? 0,
  }));
}
