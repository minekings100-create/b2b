import "server-only";

import { createClient } from "@/lib/supabase/server";
import { siblingsByGroup, type VariantSibling } from "./variants";

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
  /** Populated only when fetched via `includeArchived` — null for active rows. */
  deleted_at: string | null;
  inventory: {
    quantity_on_hand: number;
    quantity_reserved: number;
    reorder_level: number;
    warehouse_location: string | null;
  } | null;
  available: number;
  in_stock: boolean;
  variant_group_id: string | null;
  variant_label: string | null;
  /** Siblings in the same variant group (includes this product itself). */
  variants: VariantSibling[];
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
  /**
   * When true, return ONLY soft-deleted rows (`deleted_at IS NOT NULL`).
   * Admin-only UI surface. Phase 7b-2b.
   */
  archivedOnly?: boolean;
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
  deleted_at: string | null;
  variant_group_id: string | null;
  variant_label: string | null;
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
       min_order_qty, max_order_qty, category_id, image_path, deleted_at,
       variant_group_id, variant_label,
       product_categories (name),
       inventory (quantity_on_hand, quantity_reserved, reorder_level, warehouse_location)`,
      { count: "exact" },
    )
    .order("sku", { ascending: true });
  if (query.archivedOnly) {
    // Admin-only view — shows soft-deleted rows so they can be restored.
    builder = builder.not("deleted_at", "is", null);
  } else {
    builder = builder.is("deleted_at", null).eq("active", true);
  }

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

  // Fan out variant siblings in one query for every grouped row on this page.
  const groupIds = Array.from(
    new Set(
      rawRows
        .map((r) => r.variant_group_id)
        .filter((g): g is string => Boolean(g)),
    ),
  );
  const siblings = await siblingsByGroup(groupIds);

  // Collect every image_path we'll need URLs for — both main rows and
  // any sibling variants — into one batch-sign call. Sibling swaps stay
  // network-free after this.
  const allPaths = new Set<string>();
  for (const r of rawRows) {
    if (r.image_path) allPaths.add(r.image_path);
  }
  for (const list of siblings.values()) {
    for (const s of list) if (s.image_path) allPaths.add(s.image_path);
  }
  const signedUrlMap = await signImagePaths(Array.from(allPaths));

  // Enrich siblings with their resolved signed URLs so the client-side
  // variant switcher can render without another round trip.
  for (const list of siblings.values()) {
    for (const s of list) {
      s.image_url = s.image_path
        ? signedUrlMap.get(s.image_path) ?? null
        : null;
    }
  }

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
      deleted_at: row.deleted_at,
      inventory: inv,
      available,
      in_stock: available > 0,
      variant_group_id: row.variant_group_id,
      variant_label: row.variant_label,
      variants: row.variant_group_id
        ? siblings.get(row.variant_group_id) ?? []
        : [],
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

export type CatalogCategoryWithCount = CatalogCategory & {
  product_count: number;
  deleted_at: string | null;
};

/**
 * Categories page needs a "how many products reference each" count so admins
 * can judge delete impact. One round-trip via PostgREST's `count` aggregate.
 *
 * Phase 7b-2b — `archivedOnly` flips to the soft-deleted set for the
 * admin-only archived view. Default (false) keeps the active-only
 * behaviour the rest of the app depends on.
 */
export async function fetchCategoriesWithCounts(
  opts: { archivedOnly?: boolean } = {},
): Promise<CatalogCategoryWithCount[]> {
  const supabase = createClient();
  let builder = supabase
    .from("product_categories")
    .select(
      `id, name, sort_order, deleted_at,
       products (count)`,
    )
    .order("sort_order", { ascending: true });
  if (opts.archivedOnly) {
    builder = builder.not("deleted_at", "is", null);
  } else {
    builder = builder.is("deleted_at", null);
  }
  const { data, error } = await builder;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const products = row.products as unknown as { count: number }[] | null;
    return {
      id: row.id,
      name: row.name,
      sort_order: row.sort_order,
      deleted_at: row.deleted_at,
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
       min_order_qty, max_order_qty, category_id, image_path, deleted_at,
       variant_group_id, variant_label,
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

  const variants = row.variant_group_id
    ? (await siblingsByGroup([row.variant_group_id])).get(
        row.variant_group_id,
      ) ?? []
    : [];

  // Sign the main image + every sibling image in one batch.
  const paths = new Set<string>();
  if (row.image_path) paths.add(row.image_path);
  for (const v of variants) if (v.image_path) paths.add(v.image_path);
  const signedUrlMap = paths.size > 0 ? await signImagePaths(Array.from(paths)) : null;
  for (const v of variants) {
    v.image_url = v.image_path && signedUrlMap
      ? signedUrlMap.get(v.image_path) ?? null
      : null;
  }

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
    deleted_at: row.deleted_at,
    inventory: inv,
    available,
    in_stock: available > 0,
    variant_group_id: row.variant_group_id,
    variant_label: row.variant_label,
    variants,
    barcodes: (row.product_barcodes ?? [])
      .filter((b) => !b.deleted_at)
      .map((b) => ({
        id: b.id,
        barcode: b.barcode,
        unit_multiplier: b.unit_multiplier,
      })),
  };
}
