import "server-only";

import { createClient } from "@/lib/supabase/server";

const PRODUCT_IMAGES_BUCKET = "product-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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
  image_path: string | null;
  image_url: string | null;
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

type RawInventory = {
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_level: number;
  warehouse_location: string | null;
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
  image_path: string | null;
  product_categories: { name: string } | null;
  // PostgREST returns a single object for 1:1 relationships (inventory's
  // FK on product_id is unique). When there is no matching row, it may
  // come back as either `null` or an empty array depending on the client
  // version, so `normalizeInventory` handles both.
  inventory: RawInventory | RawInventory[] | null;
};

function normalizeInventory(
  raw: RawInventory | RawInventory[] | null | undefined,
): RawInventory | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Batch-sign storage paths for product images in a single round trip. Rows
 * without a path get `null` back.
 */
async function signImagePaths(
  paths: string[],
): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) {
    // Signing failures shouldn't break the list — fall back to missing images.
    console.error("signImagePaths failed", error);
    for (const p of unique) map.set(p, null);
    return map;
  }
  for (const entry of data ?? []) {
    map.set(entry.path ?? "", entry.signedUrl ?? null);
  }
  return map;
}

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
       min_order_qty, max_order_qty, category_id, image_path,
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

  const rawRows = (data ?? []) as unknown as RawRow[];
  const signedUrlMap = await signImagePaths(
    rawRows.map((r) => r.image_path).filter((p): p is string => Boolean(p)),
  );

  const mapped: CatalogProduct[] = rawRows.map((row) => {
    const inv = normalizeInventory(row.inventory);
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
      image_path: row.image_path,
      image_url: row.image_path ? signedUrlMap.get(row.image_path) ?? null : null,
      inventory: inv,
      available,
      in_stock: available > 0,
    };
  });

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

export type CatalogCategoryWithCount = CatalogCategory & { product_count: number };

/**
 * Categories page needs a "how many products reference each" count so admins
 * can judge delete impact. One round-trip via PostgREST's `count` aggregate.
 */
export async function fetchCategoriesWithCounts(): Promise<
  CatalogCategoryWithCount[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select(
      `id, name, sort_order,
       products (count)`,
    )
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const products = row.products as unknown as { count: number }[] | null;
    return {
      id: row.id,
      name: row.name,
      sort_order: row.sort_order,
      product_count: products?.[0]?.count ?? 0,
    };
  });
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
       min_order_qty, max_order_qty, category_id, image_path,
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
  const inv = normalizeInventory(row.inventory);
  const onHand = inv?.quantity_on_hand ?? 0;
  const reserved = inv?.quantity_reserved ?? 0;
  const available = Math.max(0, onHand - reserved);

  const signedUrlMap = row.image_path ? await signImagePaths([row.image_path]) : null;

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
    image_path: row.image_path,
    image_url:
      row.image_path && signedUrlMap
        ? signedUrlMap.get(row.image_path) ?? null
        : null,
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
