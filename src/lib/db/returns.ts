import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Phase 6 — RMA list + detail loaders (SPEC §8.7).
 *
 * RLS narrows reads to admin/super globally + branch own.
 */

type Status = Database["public"]["Enums"]["return_status"];
type Condition = Database["public"]["Enums"]["return_item_condition"];
type Resolution = Database["public"]["Enums"]["return_item_resolution"];

export const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "received",
  "processed",
  "closed",
] as const satisfies readonly Status[];

export const RETURNS_SORTABLE_COLUMNS = [
  "rma_number",
  "branch",
  "status",
  "requested_at",
] as const;
export type ReturnsSortColumn = (typeof RETURNS_SORTABLE_COLUMNS)[number];

const RETURNS_SORT_DB_COLUMN: Record<ReturnsSortColumn, string> = {
  rma_number: "rma_number",
  branch: "branch_id",
  status: "status",
  requested_at: "requested_at",
};

export type ReturnListRow = {
  id: string;
  rma_number: string;
  order_id: string;
  order_number: string | null;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  status: Status;
  requested_at: string;
  requested_by_email: string | null;
  item_count: number;
};

export async function fetchVisibleReturns(
  statusFilter?: Status | null,
  sort?: { column: ReturnsSortColumn; direction: "asc" | "desc" } | null,
): Promise<ReturnListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("returns")
    .select(
      `
        id, rma_number, order_id, branch_id, status, requested_at,
        requested_by_user_id,
        orders:order_id ( order_number ),
        branches:branch_id ( branch_code, name ),
        return_items ( id )
      `,
    )
    .is("deleted_at", null)
    .limit(200);
  if (statusFilter) q = q.eq("status", statusFilter);
  if (sort) {
    q = q.order(RETURNS_SORT_DB_COLUMN[sort.column], {
      ascending: sort.direction === "asc",
      nullsFirst: false,
    });
  } else {
    q = q.order("requested_at", { ascending: false });
  }
  const { data, error } = await q;
  if (error) throw new Error(`fetchVisibleReturns: ${error.message}`);

  const userIds = Array.from(
    new Set((data ?? []).map((r) => r.requested_by_user_id)),
  );
  const emails = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", userIds);
    for (const u of users ?? []) emails.set(u.id, u.email);
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    rma_number: r.rma_number,
    order_id: r.order_id,
    order_number: r.orders?.order_number ?? null,
    branch_id: r.branch_id,
    branch_code: r.branches?.branch_code ?? "—",
    branch_name: r.branches?.name ?? "—",
    status: r.status,
    requested_at: r.requested_at,
    requested_by_email: emails.get(r.requested_by_user_id) ?? null,
    item_count: (r.return_items ?? []).length,
  }));
}

export type ReturnDetailItem = {
  id: string;
  order_item_id: string;
  sku: string;
  name: string;
  quantity: number;
  condition: Condition;
  resolution: Resolution | null;
  /** Original order line quantity — useful to bound the return quantity
   *  admin can approve (can't return more than were shipped). */
  order_quantity_approved: number | null;
  /** Product unit — mostly for display. */
  unit: string;
};

export type ReturnTimelineEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  after_json: Json | null;
};

export type ReturnDetail = {
  id: string;
  rma_number: string;
  order_id: string;
  order_number: string | null;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  requested_by_user_id: string;
  requested_by_email: string | null;
  status: Status;
  reason: string | null;
  notes: string | null;
  requested_at: string;
  processed_at: string | null;
  items: ReturnDetailItem[];
  timeline: ReturnTimelineEntry[];
};

export async function fetchReturnDetail(
  id: string,
): Promise<ReturnDetail | null> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("returns")
    .select(
      `
        id, rma_number, order_id, branch_id, status, reason, notes,
        requested_at, processed_at, requested_by_user_id,
        orders:order_id ( order_number ),
        branches:branch_id ( branch_code, name ),
        return_items (
          id, order_item_id, quantity, condition, resolution,
          order_items!inner (
            quantity_approved,
            products!inner ( sku, name, unit )
          )
        )
      `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`fetchReturnDetail: ${error.message}`);
  if (!row) return null;

  const { data: audit } = await supabase
    .from("audit_log")
    .select("id, action, actor_user_id, after_json, created_at")
    .eq("entity_type", "return")
    .eq("entity_id", id)
    .order("created_at", { ascending: true });

  const actorIds = Array.from(
    new Set(
      [row.requested_by_user_id, ...(audit ?? []).map((a) => a.actor_user_id)].filter(
        (x): x is string => typeof x === "string",
      ),
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

  return {
    id: row.id,
    rma_number: row.rma_number,
    order_id: row.order_id,
    order_number: row.orders?.order_number ?? null,
    branch_id: row.branch_id,
    branch_code: row.branches?.branch_code ?? "—",
    branch_name: row.branches?.name ?? "—",
    requested_by_user_id: row.requested_by_user_id,
    requested_by_email: emails.get(row.requested_by_user_id) ?? null,
    status: row.status,
    reason: row.reason,
    notes: row.notes,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    items: (row.return_items ?? []).map((ri) => ({
      id: ri.id,
      order_item_id: ri.order_item_id,
      sku: ri.order_items!.products!.sku,
      name: ri.order_items!.products!.name,
      unit: ri.order_items!.products!.unit ?? "piece",
      quantity: ri.quantity,
      condition: ri.condition,
      resolution: ri.resolution,
      order_quantity_approved: ri.order_items!.quantity_approved,
    })),
    timeline: (audit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor_email: a.actor_user_id
        ? (emails.get(a.actor_user_id) ?? null)
        : null,
      created_at: a.created_at,
      after_json: a.after_json,
    })),
  };
}

/**
 * Lines available to return on a `delivered` order — i.e. every
 * quantity_approved line that hasn't already been returned in full.
 * Used by the "create return" form to bound user choices.
 */
export type ReturnableLine = {
  order_item_id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  /** How many admin approved on the order. */
  qty_approved: number;
  /** Already consumed by other returns (any status ≠ rejected). */
  qty_returned: number;
  /** qty_approved − qty_returned, clamped to 0. */
  qty_remaining: number;
};

export async function fetchReturnableLinesForOrder(
  orderId: string,
): Promise<ReturnableLine[]> {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `
        id, status,
        order_items (
          id, product_id, quantity_approved,
          products!inner ( sku, name, unit )
        )
      `,
    )
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return [];
  if (order.status !== "delivered" && order.status !== "closed") return [];

  const orderItemIds = (order.order_items ?? []).map((i) => i.id);
  if (orderItemIds.length === 0) return [];

  // Sum already-returned quantities per order_item across non-rejected returns.
  const { data: returnItems } = await supabase
    .from("return_items")
    .select(
      `
        order_item_id, quantity,
        returns!inner ( status )
      `,
    )
    .in("order_item_id", orderItemIds);
  const returnedByItem = new Map<string, number>();
  for (const ri of returnItems ?? []) {
    if (ri.returns?.status === "rejected") continue;
    const cur = returnedByItem.get(ri.order_item_id) ?? 0;
    returnedByItem.set(ri.order_item_id, cur + ri.quantity);
  }

  return (order.order_items ?? [])
    .filter((i) => (i.quantity_approved ?? 0) > 0)
    .map((i) => {
      const approved = i.quantity_approved ?? 0;
      const returned = returnedByItem.get(i.id) ?? 0;
      const remaining = Math.max(0, approved - returned);
      return {
        order_item_id: i.id,
        product_id: i.product_id,
        sku: i.products!.sku,
        name: i.products!.name,
        unit: i.products!.unit ?? "piece",
        qty_approved: approved,
        qty_returned: returned,
        qty_remaining: remaining,
      };
    });
}
