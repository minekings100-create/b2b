import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Phase 7a — read-only dashboard queries.
 *
 * Each helper runs under the user's session client so RLS handles
 * branch / role scoping. Callers in `src/app/(app)/dashboard/_components`
 * compose them per role.
 */

type OrderStatus = Database["public"]["Enums"]["order_status"];

export type StatusCount = { count: number };
export type StatusMoney = { count: number; total_cents: number };

/** Counts orders the caller can see, restricted to a status set. */
export async function countOrdersByStatus(
  statuses: OrderStatus[],
): Promise<StatusCount> {
  const supabase = createClient();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", statuses)
    .is("deleted_at", null);
  return { count: count ?? 0 };
}

/** Open invoices (issued + overdue). Returns count + total gross cents. */
export async function sumInvoicesByStatus(
  statuses: Array<Database["public"]["Enums"]["invoice_status"]>,
): Promise<StatusMoney> {
  const supabase = createClient();
  const { data } = await supabase
    .from("invoices")
    .select("total_gross_cents")
    .in("status", statuses)
    .is("deleted_at", null);
  const rows = data ?? [];
  return {
    count: rows.length,
    total_cents: rows.reduce(
      (sum, r) => sum + Number(r.total_gross_cents ?? 0),
      0,
    ),
  };
}

/**
 * Month-to-date paid spend (gross). Sums every `paid` invoice whose
 * `paid_at` falls in the current calendar month (Europe/Amsterdam).
 * Cheap enough that we don't need a derived table.
 */
export async function sumMtdPaid(): Promise<StatusMoney> {
  const supabase = createClient();
  const now = new Date();
  const startUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const { data } = await supabase
    .from("invoices")
    .select("total_gross_cents")
    .eq("status", "paid")
    .gte("paid_at", startUtc)
    .is("deleted_at", null);
  const rows = data ?? [];
  return {
    count: rows.length,
    total_cents: rows.reduce(
      (sum, r) => sum + Number(r.total_gross_cents ?? 0),
      0,
    ),
  };
}

export type RecentOrderRow = {
  id: string;
  order_number: string;
  branch_code: string;
  status: OrderStatus;
  submitted_at: string | null;
  total_gross_cents: number;
};

export async function recentOrders(limit = 5): Promise<RecentOrderRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, submitted_at, total_gross_cents, branches(branch_code)",
    )
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    order_number: r.order_number,
    branch_code: r.branches?.branch_code ?? "—",
    status: r.status,
    submitted_at: r.submitted_at,
    total_gross_cents: r.total_gross_cents,
  }));
}

export async function recentApprovedForPacking(
  limit = 5,
): Promise<RecentOrderRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, submitted_at, total_gross_cents, branches(branch_code), approved_at",
    )
    .in("status", ["approved", "picking"])
    .is("deleted_at", null)
    .order("approved_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    order_number: r.order_number,
    branch_code: r.branches?.branch_code ?? "—",
    status: r.status,
    submitted_at: r.submitted_at,
    total_gross_cents: r.total_gross_cents,
  }));
}

export async function recentBranchApprovedForHq(
  limit = 5,
): Promise<RecentOrderRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, submitted_at, total_gross_cents, branches(branch_code), branch_approved_at",
    )
    .eq("status", "branch_approved")
    .is("deleted_at", null)
    .order("branch_approved_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    order_number: r.order_number,
    branch_code: r.branches?.branch_code ?? "—",
    status: r.status,
    submitted_at: r.submitted_at,
    total_gross_cents: r.total_gross_cents,
  }));
}
