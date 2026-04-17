-- 20260417000006_catalog_extensions.sql
-- Phase 1.5 scaffolding — SPEC §6 catalog & inventory completion.
-- Adds product_barcodes, inventory, inventory_movements with full RLS.
-- No feature code, no Server Actions. Phase 2 builds on top.

-- -------- product_barcodes --------------------------------------------------

create table public.product_barcodes (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  barcode         text not null,
  unit_multiplier integer not null default 1 check (unit_multiplier >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz,
  unique (barcode)
);

create index product_barcodes_product_idx on public.product_barcodes (product_id) where deleted_at is null;

create trigger product_barcodes_updated_at before update on public.product_barcodes
  for each row execute function public.set_updated_at();

alter table public.product_barcodes enable row level security;

create policy product_barcodes_select on public.product_barcodes
  for select to authenticated using (deleted_at is null);

create policy product_barcodes_modify on public.product_barcodes
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.product_barcodes to authenticated;

-- -------- inventory ---------------------------------------------------------

create table public.inventory (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null unique references public.products(id) on delete cascade,
  quantity_on_hand   integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved  integer not null default 0 check (quantity_reserved >= 0),
  reorder_level      integer not null default 0 check (reorder_level >= 0),
  warehouse_location text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  deleted_at         timestamptz
);

create index inventory_product_idx on public.inventory (product_id) where deleted_at is null;

create trigger inventory_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

alter table public.inventory enable row level security;

-- Reads: any authenticated user. Enables the branch "in-stock only" toggle
-- in the catalog (Phase 2) without exposing write paths.
create policy inventory_select on public.inventory
  for select to authenticated using (deleted_at is null);

create policy inventory_modify on public.inventory
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
  );

grant select, insert, update, delete on public.inventory to authenticated;

-- -------- inventory_movements (append-only) ---------------------------------

create type public.inventory_movement_reason as enum (
  'order_reserved',
  'order_released',
  'packed',
  'adjustment_in',
  'adjustment_out',
  'return_in'
);

create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  delta          integer not null,
  reason         public.inventory_movement_reason not null,
  reference_type text,
  reference_id   uuid,
  actor_user_id  uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index inventory_movements_product_idx   on public.inventory_movements (product_id);
create index inventory_movements_reference_idx on public.inventory_movements (reference_type, reference_id);
create index inventory_movements_created_idx   on public.inventory_movements (created_at);

alter table public.inventory_movements enable row level security;

-- Read: admin + super_admin + packer (pick-list context).
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
  );

-- Insert: admin + super_admin + packer. No updates, no deletes — append-only.
create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
  );

grant select, insert on public.inventory_movements to authenticated;
revoke update, delete on public.inventory_movements from authenticated;

comment on table public.product_barcodes     is 'Alternate barcodes per product with unit multipliers (SPEC §6).';
comment on table public.inventory            is 'Per-product on-hand + reserved counts; warehouse location (SPEC §6).';
comment on table public.inventory_movements  is 'Append-only inventory ledger (SPEC §6). No updates or deletes.';
