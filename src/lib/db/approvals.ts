import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Status = Database["public"]["Enums"]["order_status"];

export type ApprovalQueueRow = {
  id: string;
  order_number: string;
  branch_id: string;
  branch_code: string;
  status: Status;
  created_by_email: string | null;
  branch_approved_by_user_id: string | null;
  branch_approved_by_email: string | null;
  submitted_at: string | null;
  branch_approved_at: string | null;
  total_gross_cents: number;
  item_count: number;
};

type Raw = {
  id: string;
  order_number: string;
  branch_id: string;
  status: Status;
  submitted_at: string | null;
  branch_approved_at: string | null;
  branch_approved_by_user_id: string | null;
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
 * Fetch orders awaiting an approval decision in the given source state(s),
 * scoped by the caller's RLS. Used by both Branch-Manager and HQ-Manager
 * queue views — pass `["submitted"]` for step 1 (BM queue) or
 * `["branch_approved"]` for step 2 (HQ queue), or both for the combined
 * "All pending" tab.
 *
 * Sort key matches the spec: oldest at the top of the queue. For step 1
 * we sort by `submitted_at`; for step 2 by `branch_approved_at`. The
 * combined view sorts by whichever timestamp is most recent (the order's
 * "current waiting since" — that's the actionable signal).
 */
export async function fetchApprovalQueue(
  statuses: Status[] = ["submitted"],
): Promise<ApprovalQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, branch_id, status, submitted_at,
       branch_approved_at, branch_approved_by_user_id, total_gross_cents,
       branches ( branch_code ),
       users!orders_created_by_user_id_fkey ( email ),
       order_items ( count )`,
    )
    .in("status", statuses)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true })
    .limit(200);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    branch_id: row.branch_id,
    branch_code: one(row.branches)?.branch_code ?? "—",
    status: row.status,
    created_by_email: one(row.users)?.email ?? null,
    branch_approved_by_user_id: row.branch_approved_by_user_id,
    branch_approved_by_email: null as string | null,
    submitted_at: row.submitted_at,
    branch_approved_at: row.branch_approved_at,
    total_gross_cents: row.total_gross_cents,
    item_count: row.order_items?.[0]?.count ?? 0,
  }));

  // Hydrate branch-approver emails in one follow-up — keeps the main
  // query lean and lets RLS shape the result.
  const approverIds = Array.from(
    new Set(
      rows
        .map((r) => r.branch_approved_by_user_id)
        .filter((x): x is string => typeof x === "string"),
    ),
  );
  if (approverIds.length > 0) {
    const { data: approvers } = await supabase
      .from("users")
      .select("id, email")
      .in("id", approverIds);
    const map = new Map((approvers ?? []).map((u) => [u.id, u.email]));
    for (const r of rows) {
      if (r.branch_approved_by_user_id) {
        r.branch_approved_by_email =
          map.get(r.branch_approved_by_user_id) ?? null;
      }
    }
  }
  return rows;
}
