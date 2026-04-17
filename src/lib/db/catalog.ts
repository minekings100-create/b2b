import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price_cents: number;
  vat_rate: number;
  min_order_qty: number;
  max_order_qty: number | null;
  category_id: string | null;
  category_name: string | null;
  inventory: {
    quantity_on_hand: number;
    quantity_reserved: number;
    reorder_level: number;
    warehouse_location: string | null;
  } | null;
  available: number;
  in_stock: boolean;
};

export type CatalogCategory = { id: string; name: string; sort_order: number };

export type CatalogQuery = {
  q?: string;
  categoryId?: string;
  inStockOnly?: boolean;
  /** 0-indexed page. */
  page?: number;
  /** Hard cap per page. */
  pageSize?: number;
};

type RawRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price_cents: number;
  vat_rate: number;
  min_order_qty: number;
  max_order_qty: number | null;
  category_id: string | null;
  product_categories: { name: string } | null;
  inventory:
    | {
        quantity_on_hand: number;
        quantity_reserved: number;
        reorder_level: number;
        warehouse_location: string | null;
      }[]
    | null;
};

/**
 * Fetch a page of catalog rows. Server Component only — relies on the
 * request-scoped Supabase client and RLS.
 *
 * `in_stock_only` is applied JS-side after the fetch. At 500-SKU scale this
 * is cheap; Phase 2.2+ can switch to an RPC or `.gt("inventory.quantity_on_hand", 0)`
 * once the UI needs server-side pagination under the filter.
 */
export async function fetchCatalogPage(
  query: CatalogQuery,
): Promise<{ rows: CatalogProduct[]; total: number }> {
  const supabase = createClient();
  const pageSize = query.pageSize ?? 50;
  const page = Math.max(0, query.page ?? 0);

  let builder = supabase
    .from("products")
    .select(
      `id, sku, name, description, unit, unit_price_cents, vat_rate,
       min_order_qty, max_order_qty, category_id,
       product_categories (name),
       inventory (quantity_on_hand, quantity_reserved, reorder_level, warehouse_location)`,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .eq("active", true)
    .order("sku", { ascending: true });

  if (query.q && query.q.trim().length > 0) {
    const term = query.q.trim().replace(/[,]/g, "");
    // `or` filter: match sku OR name, case-insensitive.
    builder = builder.or(`sku.ilike.%${term}%,name.ilike.%${term}%`);
  }
  if (query.categoryId) {
    builder = builder.eq("category_id", query.categoryId);
  }

  // Over-fetch if the in-stock filter is on so we can still fill `pageSize`
  // after the JS-side filter. Simplest heuristic: fetch pageSize * 4.
  const from = page * pageSize;
  const fetchSize = query.inStockOnly ? pageSize * 4 : pageSize;
  builder = builder.range(from, from + fetchSize - 1);

  const { data, error, count } = await builder;
  if (error) throw error;

  const mapped: CatalogProduct[] = ((data ?? []) as unknown as RawRow[]).map(
    (row) => {
      const inv = row.inventory?.[0] ?? null;
      const onHand = inv?.quantity_on_hand ?? 0;
      const reserved = inv?.quantity_reserved ?? 0;
      const available = Math.max(0, onHand - reserved);
      return {
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        unit: row.unit,
        unit_price_cents: row.unit_price_cents,
        vat_rate: row.vat_rate,
        min_order_qty: row.min_order_qty,
        max_order_qty: row.max_order_qty,
        category_id: row.category_id,
        category_name: row.product_categories?.name ?? null,
        inventory: inv,
        available,
        in_stock: available > 0,
      };
    },
  );

  const filtered = query.inStockOnly
    ? mapped.filter((p) => p.in_stock).slice(0, pageSize)
    : mapped;

  return { rows: filtered, total: count ?? 0 };
}

export async function fetchCatalogCategories(): Promise<CatalogCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ProductDetail = CatalogProduct & {
  barcodes: { id: string; barcode: string; unit_multiplier: number }[];
};

export async function fetchProductDetail(
  id: string,
): Promise<ProductDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, sku, name, description, unit, unit_price_cents, vat_rate,
       min_order_qty, max_order_qty, category_id,
       product_categories (name),
       inventory (quantity_on_hand, quantity_reserved, reorder_level, warehouse_location),
       product_barcodes (id, barcode, unit_multiplier)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawRow & {
    product_barcodes: {
      id: string;
      barcode: string;
      unit_multiplier: number;
      deleted_at?: string | null;
    }[];
  };
  const inv = row.inventory?.[0] ?? null;
  const onHand = inv?.quantity_on_hand ?? 0;
  const reserved = inv?.quantity_reserved ?? 0;
  const available = Math.max(0, onHand - reserved);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    unit_price_cents: row.unit_price_cents,
    vat_rate: row.vat_rate,
    min_order_qty: row.min_order_qty,
    max_order_qty: row.max_order_qty,
    category_id: row.category_id,
    category_name: row.product_categories?.name ?? null,
    inventory: inv,
    available,
    in_stock: available > 0,
    barcodes: (row.product_barcodes ?? [])
      .filter((b) => !b.deleted_at)
      .map((b) => ({
        id: b.id,
        barcode: b.barcode,
        unit_multiplier: b.unit_multiplier,
      })),
  };
}
