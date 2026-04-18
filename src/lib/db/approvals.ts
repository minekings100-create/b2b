import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ApprovalQueueRow = {
  id: string;
  order_number: string;
  branch_id: string;
  branch_code: string;
  created_by_email: string | null;
  submitted_at: string | null;
  total_gross_cents: number;
  item_count: number;
};

type Raw = {
  id: string;
  order_number: string;
  branch_id: string;
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
 * Submitted orders the caller can approve. RLS handles the branch scoping
 * for branch_manager; super_admin / administration see everything via the
 * same query.
 */
export async function fetchApprovalQueue(): Promise<ApprovalQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, branch_id, submitted_at, total_gross_cents,
       branches ( branch_code ),
       users!orders_created_by_user_id_fkey ( email ),
       order_items ( count )`,
    )
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    branch_id: row.branch_id,
    branch_code: one(row.branches)?.branch_code ?? "—",
    created_by_email: one(row.users)?.email ?? null,
    submitted_at: row.submitted_at,
    total_gross_cents: row.total_gross_cents,
    item_count: row.order_items?.[0]?.count ?? 0,
  }));
}
