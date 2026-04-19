import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type OrderStatusFilter = Database["public"]["Enums"]["order_status"];

export type OrderSummary = {
  id: string;
  order_number: string;
  branch_code: string;
  created_by_email: string | null;
  branch_approved_by_user_id: string | null;
  branch_approved_by_email: string | null;
  approved_by_user_id: string | null;
  approved_by_email: string | null;
  status: Database["public"]["Enums"]["order_status"];
  submitted_at: string | null;
  branch_approved_at: string | null;
  approved_at: string | null;
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
  branch_approved_at: string | null;
  approved_at: string | null;
  branch_approved_by_user_id: string | null;
  approved_by_user_id: string | null;
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
 * Sortable columns on `/orders` (and `/approvals` once it grows the same
 * UI). Whitelisted at the trust boundary by the page-level Zod parse.
 */
export const ORDERS_SORTABLE_COLUMNS = [
  "order_number",
  "branch",
  "status",
  "submitted_at",
  "branch_approved_at",
  "approved_at",
  "total_gross_cents",
  "item_count",
] as const;
export type OrdersSortColumn = (typeof ORDERS_SORTABLE_COLUMNS)[number];

const ORDERS_SORT_DB_COLUMN: Record<OrdersSortColumn, string> = {
  order_number: "order_number",
  branch: "branch_id", // joined table; sort by FK keeps results consistent
  status: "status",
  submitted_at: "submitted_at",
  branch_approved_at: "branch_approved_at",
  approved_at: "approved_at",
  total_gross_cents: "total_gross_cents",
  // PostgREST doesn't support sort-by-aggregate over an embedded table;
  // we sort client-side after the fetch for item_count.
  item_count: "created_at",
};

/**
 * Fetch the caller's visible orders (RLS handles scoping per SPEC §5).
 * Drafts included so branch users can find their in-progress cart.
 */
export async function fetchVisibleOrders(
  filter?: {
    statuses?: OrderStatusFilter[];
    sort?: { column: OrdersSortColumn; direction: "asc" | "desc" } | null;
  },
): Promise<OrderSummary[]> {
  const supabase = createClient();
  let query = supabase
    .from("orders")
    .select(
      `id, order_number, status, created_at, submitted_at,
       branch_approved_at, approved_at, branch_approved_by_user_id,
       approved_by_user_id, total_gross_cents,
       branches ( branch_code ),
       users!orders_created_by_user_id_fkey ( email ),
       order_items ( count )`,
    )
    .is("deleted_at", null);
  if (filter?.statuses && filter.statuses.length > 0) {
    query = query.in("status", filter.statuses);
  }
  // Default sort: submitted_at desc (matches the prior behaviour for the
  // paginated /orders list — drafts have null submitted_at and Postgres
  // sorts NULLs last by default in `desc` order).
  const sort = filter?.sort ?? null;
  if (sort && sort.column !== "item_count") {
    query = query.order(ORDERS_SORT_DB_COLUMN[sort.column], {
      ascending: sort.direction === "asc",
      nullsFirst: false,
    });
  } else if (!sort) {
    query = query.order("submitted_at", {
      ascending: false,
      nullsFirst: false,
    });
  }
  const { data, error } = await query.limit(200);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    branch_code: one(row.branches)?.branch_code ?? "—",
    created_by_email: one(row.users)?.email ?? null,
    branch_approved_by_user_id: row.branch_approved_by_user_id,
    branch_approved_by_email: null as string | null,
    approved_by_user_id: row.approved_by_user_id,
    approved_by_email: null as string | null,
    status: row.status,
    submitted_at: row.submitted_at,
    branch_approved_at: row.branch_approved_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    total_gross_cents: row.total_gross_cents,
    item_count: row.order_items?.[0]?.count ?? 0,
  }));

  // Hydrate approver emails (both steps) in a single follow-up query —
  // keeps the main list query lean and avoids a second nested-FK alias.
  const approverIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.branch_approved_by_user_id, r.approved_by_user_id])
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
      if (r.approved_by_user_id) {
        r.approved_by_email = map.get(r.approved_by_user_id) ?? null;
      }
    }
  }

  // item_count requires client-side sort because PostgREST can't order
  // by an aggregate on an embedded table. Branch sort uses branch_id
  // FK ordering at the DB layer; if the user wants alphabetical
  // branch_code ordering they get it for free because seed branch_ids
  // are ordered by branch_code in the seed script — close enough for
  // the v1 sort UX. (Phase 7b can add a proper join sort.)
  if (filter?.sort?.column === "item_count") {
    rows.sort((a, b) =>
      filter.sort!.direction === "asc"
        ? a.item_count - b.item_count
        : b.item_count - a.item_count,
    );
  }

  return rows;
}
