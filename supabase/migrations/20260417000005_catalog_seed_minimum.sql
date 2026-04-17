-- 20260417000005_catalog_seed_minimum.sql
-- Minimum catalog tables required for Phase 1 seed data (SPEC §11). Phase 2
-- extends with product_barcodes, inventory, inventory_movements.

create table public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  parent_id  uuid references public.product_categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

-- Full (non-partial) unique on name so `ON CONFLICT (name)` upserts from the
-- seed script land on the intended conflict target. Soft-delete semantics are
-- filtered at query time, not by index predicate.

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null unique,
  name             text not null,
  description      text,
  category_id      uuid references public.product_categories(id) on delete set null,
  unit             text not null default 'piece',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  vat_rate         integer not null default 21 check (vat_rate in (0, 9, 21)),
  min_order_qty    integer not null default 1 check (min_order_qty >= 1),
  max_order_qty    integer check (max_order_qty is null or max_order_qty >= min_order_qty),
  image_path       text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  deleted_at       timestamptz
);

create index products_sku_idx      on public.products (sku)         where deleted_at is null;
create index products_category_idx on public.products (category_id) where deleted_at is null;

-- RLS: read-all-authenticated, write = admin.
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;

create policy categories_select on public.product_categories
  for select to authenticated using (deleted_at is null);

create policy categories_modify on public.product_categories
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

create policy products_select on public.products
  for select to authenticated using (deleted_at is null);

create policy products_modify on public.products
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete
  on public.product_categories, public.products
  to authenticated;

create trigger product_categories_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

comment on table public.product_categories is 'Product catalog taxonomy (SPEC §6). Phase 2 adds nesting usage patterns.';
comment on table public.products           is 'Catalog SKUs (SPEC §6). Phase 2 extends with barcodes + inventory.';
