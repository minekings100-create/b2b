-- 20260422000001_product_variants.sql
-- Post-MVP Sprint 3 — product variant grouping.
--
-- Same product in multiple sizes/formats (e.g. 500ml vs 1L, S / M / L) today
-- means two separate SKUs with duplicated name + description + image. We add
-- a lightweight grouping column so the catalog UI can render a variant switcher
-- chip row without splitting prices, stock, or barcodes. Each variant keeps
-- its own row with its own SKU, price_cents, inventory, and barcodes —
-- `variant_group_id` is pure presentation. Cart + order flow is unchanged.
--
-- Design note: we intentionally do NOT add a `variant_groups` table. The
-- grouping is a shared UUID, semantically identical to a 1:N FK but one
-- less join and one less table to maintain. When a group is "created" in
-- the admin UI it's just `crypto.randomUUID()` assigned to the first
-- product's variant_group_id. Subsequent variants share it. "Ungroup"
-- nulls the column on the row in question.
--
-- RLS: no new policy required. The products table already enforces
-- admin-only writes; variant_group_id + variant_label are just more
-- columns on an already-gated row.

alter table public.products
  add column variant_group_id uuid,
  add column variant_label    text;

comment on column public.products.variant_group_id is
  'Post-MVP Sprint 3 — presentational grouping UUID. Products sharing this value are variants of each other (size/format). No FK; the shared UUID IS the group. Null for non-variant products.';
comment on column public.products.variant_label is
  'Post-MVP Sprint 3 — short user-facing label for this variant (e.g. "500ml", "L", "Blue"). Null for non-variant products. Recommended ≤ 20 chars — UI chips truncate long labels.';

-- Sparse partial index: most SKUs are ungrouped. The catalog-card sibling
-- lookup is "select * from products where variant_group_id = ? AND deleted_at
-- IS NULL AND active = true". Partial keeps the index small and the query
-- plan index-only for the hot filter.
create index products_variant_group_idx
  on public.products (variant_group_id)
  where variant_group_id is not null and deleted_at is null;

-- Soft guard: a row with variant_label should also have variant_group_id
-- (a label without a group is meaningless for the UI). Enforced at the
-- Postgres layer as a CHECK constraint so a bad migration / script can't
-- leave orphan labels behind.
alter table public.products
  add constraint products_variant_label_requires_group
  check (variant_label is null or variant_group_id is not null);
