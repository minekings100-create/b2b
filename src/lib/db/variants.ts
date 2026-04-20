import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Post-MVP Sprint 3 — variant-group helpers.
 *
 * Products sharing `variant_group_id` are presentational variants of
 * each other. `siblingsByGroup` fans out a list of group ids to their
 * members in a single query — used by the catalog grid to render chip
 * switchers, and by the admin edit drawer to list "other variants in
 * this group".
 */

export type VariantSibling = {
  id: string;
  sku: string;
  name: string;
  variant_label: string | null;
  unit_price_cents: number;
  image_path: string | null;
  /**
   * Caller enriches this post-fetch (catalog page + detail do a single
   * batch-sign). `null` when the sibling has no image_path OR when the
   * caller opted out of signing (e.g. admin contexts that only need id/
   * sku).
   */
  image_url: string | null;
  available: number;
};

type RawSiblingRow = {
  id: string;
  sku: string;
  name: string;
  variant_group_id: string | null;
  variant_label: string | null;
  unit_price_cents: number;
  image_path: string | null;
  inventory: {
    quantity_on_hand: number;
    quantity_reserved: number;
  } | Array<{ quantity_on_hand: number; quantity_reserved: number }> | null;
};

function availableFromRaw(inv: RawSiblingRow["inventory"]): number {
  if (!inv) return 0;
  const one = Array.isArray(inv) ? inv[0] : inv;
  if (!one) return 0;
  return Math.max(0, one.quantity_on_hand - one.quantity_reserved);
}

/**
 * Fan out a list of variant_group_ids to their members. Returns a
 * Map keyed by group_id. Empty input short-circuits to an empty map.
 */
export async function siblingsByGroup(
  groupIds: string[],
): Promise<Map<string, VariantSibling[]>> {
  const out = new Map<string, VariantSibling[]>();
  const uniq = Array.from(new Set(groupIds.filter(Boolean)));
  if (uniq.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, sku, name, variant_group_id, variant_label, unit_price_cents,
       image_path,
       inventory (quantity_on_hand, quantity_reserved)`,
    )
    .in("variant_group_id", uniq)
    .is("deleted_at", null)
    .eq("active", true)
    .order("variant_label", { ascending: true, nullsFirst: true });
  if (error) throw error;

  for (const row of (data ?? []) as unknown as RawSiblingRow[]) {
    if (!row.variant_group_id) continue;
    const list = out.get(row.variant_group_id) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      name: row.name,
      variant_label: row.variant_label,
      unit_price_cents: row.unit_price_cents,
      image_path: row.image_path,
      image_url: null, // caller signs in a batch
      available: availableFromRaw(row.inventory),
    });
    out.set(row.variant_group_id, list);
  }
  return out;
}

export type VariantGroupOption = {
  group_id: string;
  /** Comma-joined short preview — e.g. "All-purpose cleaner · 500ml, 1L, 5L". */
  label: string;
  member_count: number;
};

/**
 * List all existing variant groups so the admin edit drawer can offer
 * "join existing group" as an alternative to "create new". Uses the
 * service-role client — admins only call this server-side and we need
 * to see every group regardless of which variant the current user is
 * editing. (RLS on products would let us see them anyway; the admin
 * client just avoids an extra round-trip for the JWT claim check.)
 *
 * Returns a short human-readable label per group, derived from the
 * first sibling's name plus a joined list of variant labels.
 */
export async function fetchVariantGroupOptions(): Promise<VariantGroupOption[]> {
  const adm = createAdminClient();
  const { data, error } = await adm
    .from("products")
    .select("id, name, variant_group_id, variant_label")
    .not("variant_group_id", "is", null)
    .is("deleted_at", null)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;

  const byGroup = new Map<
    string,
    { name: string; labels: string[] }
  >();
  for (const row of data ?? []) {
    if (!row.variant_group_id) continue;
    const entry =
      byGroup.get(row.variant_group_id) ??
      { name: row.name, labels: [] as string[] };
    if (row.variant_label) entry.labels.push(row.variant_label);
    byGroup.set(row.variant_group_id, entry);
  }
  const out: VariantGroupOption[] = [];
  for (const [group_id, entry] of byGroup) {
    out.push({
      group_id,
      label: entry.labels.length
        ? `${entry.name} · ${entry.labels.join(", ")}`
        : entry.name,
      member_count: entry.labels.length,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
