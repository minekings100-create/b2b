-- 20260417000007_orders.sql
-- Phase 1.5 scaffolding — SPEC §6 orders + order_items with full RLS.
-- Schema-only; Phase 3 builds the cart, submit, approval queue, and
-- inventory-reservation Server Actions on top.

-- -------- enums -------------------------------------------------------------

create type public.order_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'picking',
  'packed',
  'shipped',
  'delivered',
  'closed',
  'cancelled'
);

-- -------- orders ------------------------------------------------------------

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text not null unique,
  branch_id            uuid not null references public.branches(id) on delete restrict,
  created_by_user_id   uuid not null references public.users(id) on delete restrict,
  status               public.order_status not null default 'draft',
  submitted_at         timestamptz,
  approved_at          timestamptz,
  approved_by_user_id  uuid references public.users(id) on delete set null,
  rejection_reason     text,
  total_net_cents      bigint not null default 0 check (total_net_cents >= 0),
  total_vat_cents      bigint not null default 0 check (total_vat_cents >= 0),
  total_gross_cents    bigint not null default 0 check (total_gross_cents >= 0),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  deleted_at           timestamptz
);

create index orders_branch_idx   on public.orders (branch_id)          where deleted_at is null;
create index orders_status_idx   on public.orders (status)             where deleted_at is null;
create index orders_created_idx  on public.orders (created_at desc)    where deleted_at is null;
create index orders_created_by_idx on public.orders (created_by_user_id) where deleted_at is null;

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Read: own-branch for branch_user / branch_manager; global for packer,
-- administration, super_admin (packer assignment model is not yet built).
create policy orders_select on public.orders
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_role('packer')
      or public.current_user_has_branch(branch_id)
    )
  );

-- Insert: branch users + managers for their branch, administration + super
-- for any branch.
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or (
      (
        public.current_user_has_role('branch_user')
        or public.current_user_has_role('branch_manager')
      )
      and public.current_user_has_branch(branch_id)
    )
  );

-- Update: owner (while draft) via branch_user/manager, manager for approval
-- decisions, packer for picking→packed transitions, administration + super
-- unrestricted.
create policy orders_update on public.orders
  for update to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
    )
    or (
      public.current_user_has_role('branch_user')
      and public.current_user_has_branch(branch_id)
      and created_by_user_id = auth.uid()
    )
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('packer')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
    )
    or (
      public.current_user_has_role('branch_user')
      and public.current_user_has_branch(branch_id)
      and created_by_user_id = auth.uid()
    )
  );

create policy orders_delete on public.orders
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

grant select, insert, update, delete on public.orders to authenticated;

-- -------- order_items -------------------------------------------------------

create table public.order_items (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders(id) on delete cascade,
  product_id                uuid not null references public.products(id) on delete restrict,
  quantity_requested        integer not null check (quantity_requested >= 1),
  quantity_approved         integer check (quantity_approved is null or quantity_approved >= 0),
  quantity_packed           integer not null default 0 check (quantity_packed >= 0),
  quantity_shipped          integer not null default 0 check (quantity_shipped >= 0),
  unit_price_cents_snapshot integer not null check (unit_price_cents_snapshot >= 0),
  vat_rate_snapshot         integer not null check (vat_rate_snapshot in (0, 9, 21)),
  line_net_cents            bigint not null default 0 check (line_net_cents >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create trigger order_items_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();

alter table public.order_items enable row level security;

-- Policies piggy-back the parent order: if the caller can read/write the
-- order row, they can read/write its items. Keeps the two tables coherent.
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.deleted_at is null
    )
  );

create policy order_items_modify on public.order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_role('packer')
          or (
            public.current_user_has_role('branch_manager')
            and public.current_user_has_branch(o.branch_id)
          )
          or (
            public.current_user_has_role('branch_user')
            and public.current_user_has_branch(o.branch_id)
            and o.created_by_user_id = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_role('packer')
          or (
            public.current_user_has_role('branch_manager')
            and public.current_user_has_branch(o.branch_id)
          )
          or (
            public.current_user_has_role('branch_user')
            and public.current_user_has_branch(o.branch_id)
            and o.created_by_user_id = auth.uid()
          )
        )
    )
  );

grant select, insert, update, delete on public.order_items to authenticated;

comment on table public.orders      is 'Order header with lifecycle status (SPEC §6/§7). Phase 3 builds submit + approval flows.';
comment on table public.order_items is 'Line items snapshot pricing/VAT at order time (SPEC §6).';
