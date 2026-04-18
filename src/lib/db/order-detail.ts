import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type Status = Database["public"]["Enums"]["order_status"];

export type OrderDetail = {
  id: string;
  order_number: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  created_by_user_id: string;
  created_by_email: string | null;
  status: Status;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  approved_by_email: string | null;
  rejection_reason: string | null;
  notes: string | null;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  items: OrderDetailLine[];
  timeline: OrderTimelineEntry[];
};

export type OrderDetailLine = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_price_cents_snapshot: number;
  vat_rate_snapshot: number;
  quantity_requested: number;
  quantity_approved: number | null;
  quantity_packed: number;
  quantity_shipped: number;
  line_net_cents: number;
  // Current available = on_hand − reserved. Used on the approval form to
  // flag backorder candidates before committing.
  on_hand: number;
  reserved: number;
};

export type OrderTimelineEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  after_json: Json | null;
};

type RawOrder = {
  id: string;
  order_number: string;
  branch_id: string;
  created_by_user_id: string;
  status: Status;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  rejection_reason: string | null;
  notes: string | null;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  branches:
    | { branch_code: string; name: string }
    | { branch_code: string; name: string }[]
    | null;
  users:
    | { email: string }
    | { email: string }[]
    | null;
  order_items: Array<{
    id: string;
    product_id: string;
    unit_price_cents_snapshot: number;
    vat_rate_snapshot: number;
    quantity_requested: number;
    quantity_approved: number | null;
    quantity_packed: number;
    quantity_shipped: number;
    line_net_cents: number;
    products:
      | { sku: string; name: string; unit: string }
      | { sku: string; name: string; unit: string }[]
      | null;
  }>;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, branch_id, created_by_user_id, status,
       created_at, submitted_at, approved_at, approved_by_user_id,
       rejection_reason, notes,
       total_net_cents, total_vat_cents, total_gross_cents,
       branches ( branch_code, name ),
       users!orders_created_by_user_id_fkey ( email ),
       order_items (
         id, product_id, unit_price_cents_snapshot, vat_rate_snapshot,
         quantity_requested, quantity_approved, quantity_packed,
         quantity_shipped, line_net_cents,
         products ( sku, name, unit )
       )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawOrder;
  const branch = one(row.branches);
  const creator = one(row.users);

  // Inventory snapshot for each product — feeds the approval form's
  // "available" column + backorder warning.
  const productIds = row.order_items.map((it) => it.product_id);
  const invMap = new Map<
    string,
    { on_hand: number; reserved: number }
  >();
  if (productIds.length > 0) {
    const { data: inv } = await supabase
      .from("inventory")
      .select("product_id, quantity_on_hand, quantity_reserved")
      .in("product_id", productIds);
    for (const r of inv ?? []) {
      invMap.set(r.product_id, {
        on_hand: r.quantity_on_hand,
        reserved: r.quantity_reserved,
      });
    }
  }

  const items: OrderDetailLine[] = row.order_items
    .map((it) => {
      const product = one(it.products);
      const inv = invMap.get(it.product_id) ?? { on_hand: 0, reserved: 0 };
      return {
        id: it.id,
        product_id: it.product_id,
        sku: product?.sku ?? "—",
        name: product?.name ?? "—",
        unit: product?.unit ?? "piece",
        unit_price_cents_snapshot: it.unit_price_cents_snapshot,
        vat_rate_snapshot: it.vat_rate_snapshot,
        quantity_requested: it.quantity_requested,
        quantity_approved: it.quantity_approved,
        quantity_packed: it.quantity_packed,
        quantity_shipped: it.quantity_shipped,
        line_net_cents: it.line_net_cents,
        on_hand: inv.on_hand,
        reserved: inv.reserved,
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  // Status timeline from audit_log. Admin+super can read everything; branch
  // users can read their own entries via the existing policy.
  const { data: audit } = await supabase
    .from("audit_log")
    .select("id, action, actor_user_id, after_json, created_at")
    .eq("entity_type", "order")
    .eq("entity_id", row.id)
    .order("created_at", { ascending: true });

  const actorIds = Array.from(
    new Set(
      (audit ?? [])
        .map((a) => a.actor_user_id)
        .filter((x): x is string => typeof x === "string"),
    ),
  );
  let actorEmails = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", actorIds);
    actorEmails = new Map((users ?? []).map((u) => [u.id, u.email]));
  }
  const timeline: OrderTimelineEntry[] = (audit ?? []).map((a) => ({
    id: a.id,
    action: a.action,
    actor_email: a.actor_user_id ? (actorEmails.get(a.actor_user_id) ?? null) : null,
    created_at: a.created_at,
    after_json: a.after_json,
  }));

  // Approver email — pulled from the same map (the approver is also the
  // actor on the approve audit row). Falls back to a separate lookup if
  // RLS hid the approve row from this caller (shouldn't happen after the
  // 20260418000001 policy, but stays defensive).
  let approverEmail: string | null = null;
  if (row.approved_by_user_id) {
    approverEmail = actorEmails.get(row.approved_by_user_id) ?? null;
    if (!approverEmail) {
      const { data: approver } = await supabase
        .from("users")
        .select("email")
        .eq("id", row.approved_by_user_id)
        .maybeSingle();
      approverEmail = approver?.email ?? null;
    }
  }

  return {
    id: row.id,
    order_number: row.order_number,
    branch_id: row.branch_id,
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
    created_by_user_id: row.created_by_user_id,
    created_by_email: creator?.email ?? null,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    approved_by_user_id: row.approved_by_user_id,
    approved_by_email: approverEmail,
    rejection_reason: row.rejection_reason,
    notes: row.notes,
    total_net_cents: row.total_net_cents,
    total_vat_cents: row.total_vat_cents,
    total_gross_cents: row.total_gross_cents,
    items,
    timeline,
  };
}
