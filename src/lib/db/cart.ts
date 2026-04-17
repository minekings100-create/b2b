import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export type CartLine = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_price_cents_snapshot: number;
  vat_rate_snapshot: number;
  quantity_requested: number;
  line_net_cents: number;
};

export type Cart = {
  id: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  created_by_user_id: string;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  items: CartLine[];
};

type RawCartRow = {
  id: string;
  branch_id: string;
  created_by_user_id: string;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  branches: { branch_code: string; name: string } | { branch_code: string; name: string }[] | null;
  order_items: Array<{
    id: string;
    product_id: string;
    quantity_requested: number;
    unit_price_cents_snapshot: number;
    vat_rate_snapshot: number;
    line_net_cents: number;
    products: { sku: string; name: string; unit: string } | { sku: string; name: string; unit: string }[] | null;
  }>;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Fetch the caller's active draft order (if any) for a given branch. Returns
 * `null` if no draft exists yet — the "Add to cart" action creates one
 * on-demand.
 */
export async function fetchActiveCart(
  userId: string,
  branchId: string,
): Promise<Cart | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, branch_id, created_by_user_id, total_net_cents, total_vat_cents, total_gross_cents,
       branches ( branch_code, name ),
       order_items ( id, product_id, quantity_requested, unit_price_cents_snapshot, vat_rate_snapshot, line_net_cents,
                     products ( sku, name, unit ) )`,
    )
    .eq("created_by_user_id", userId)
    .eq("branch_id", branchId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawCartRow;
  const branch = one(row.branches);
  const items: CartLine[] = (row.order_items ?? []).map((it) => {
    const product = one(it.products);
    return {
      id: it.id,
      product_id: it.product_id,
      sku: product?.sku ?? "—",
      name: product?.name ?? "—",
      unit: product?.unit ?? "piece",
      unit_price_cents_snapshot: it.unit_price_cents_snapshot,
      vat_rate_snapshot: it.vat_rate_snapshot,
      quantity_requested: it.quantity_requested,
      line_net_cents: it.line_net_cents,
    };
  });
  // Stable order: by insertion id (uuid v4 is random, so use product sku).
  items.sort((a, b) => a.sku.localeCompare(b.sku));

  return {
    id: row.id,
    branch_id: row.branch_id,
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
    created_by_user_id: row.created_by_user_id,
    total_net_cents: row.total_net_cents,
    total_vat_cents: row.total_vat_cents,
    total_gross_cents: row.total_gross_cents,
    items,
  };
}

/**
 * Pick the branch the cart should target for the caller. Branch users +
 * managers get the first branch they're assigned to. Returns `null` if
 * the user has no branch-scoped role (admins/packers without a branch
 * assignment can't submit orders from their own UI).
 */
export async function resolveBranchForCart(
  userId: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_branch_roles")
    .select("branch_id, role")
    .eq("user_id", userId)
    .in("role", ["branch_user", "branch_manager"])
    .is("deleted_at", null)
    .not("branch_id", "is", null)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  return row?.branch_id ?? null;
}
