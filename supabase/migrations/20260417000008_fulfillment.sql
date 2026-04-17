-- 20260417000008_fulfillment.sql
-- Phase 1.5 scaffolding — SPEC §6 pallets/shipments with full RLS.
-- Schema-only; Phase 4 builds the packer UI, scan input, pallet labels,
-- and packing slips on top.

-- -------- pallets -----------------------------------------------------------

create type public.pallet_status as enum (
  'open',
  'packed',
  'shipped',
  'delivered'
);

create table public.pallets (
  id                  uuid primary key default gen_random_uuid(),
  pallet_number       text not null unique,
  order_id            uuid not null references public.orders(id) on delete cascade,
  packed_by_user_id   uuid references public.users(id) on delete set null,
  packed_at           timestamptz,
  status              public.pallet_status not null default 'open',
  weight_kg           numeric(10,3),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  deleted_at          timestamptz
);

create index pallets_order_idx  on public.pallets (order_id)  where deleted_at is null;
create index pallets_status_idx on public.pallets (status)    where deleted_at is null;

create trigger pallets_updated_at before update on public.pallets
  for each row execute function public.set_updated_at();

alter table public.pallets enable row level security;

-- Read: admin + super + packer always; branch user/manager when the pallet
-- belongs to an order on their branch.
create policy pallets_select on public.pallets
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_role('packer')
      or exists (
        select 1 from public.orders o
        where o.id = pallets.order_id
          and public.current_user_has_branch(o.branch_id)
      )
    )
  );

-- Write: packer + admin + super (packer is the primary actor per SPEC §5).
create policy pallets_modify on public.pallets
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

grant select, insert, update, delete on public.pallets to authenticated;

-- -------- pallet_items ------------------------------------------------------

create table public.pallet_items (
  id             uuid primary key default gen_random_uuid(),
  pallet_id      uuid not null references public.pallets(id) on delete cascade,
  order_item_id  uuid not null references public.order_items(id) on delete restrict,
  quantity       integer not null check (quantity >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index pallet_items_pallet_idx     on public.pallet_items (pallet_id);
create index pallet_items_order_item_idx on public.pallet_items (order_item_id);

create trigger pallet_items_updated_at before update on public.pallet_items
  for each row execute function public.set_updated_at();

alter table public.pallet_items enable row level security;

create policy pallet_items_select on public.pallet_items
  for select to authenticated
  using (
    exists (
      select 1 from public.pallets p
      join public.orders o on o.id = p.order_id
      where p.id = pallet_items.pallet_id
        and p.deleted_at is null
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_role('packer')
          or public.current_user_has_branch(o.branch_id)
        )
    )
  );

create policy pallet_items_modify on public.pallet_items
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

grant select, insert, update, delete on public.pallet_items to authenticated;

-- -------- shipments ---------------------------------------------------------

create table public.shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  carrier         text not null,
  tracking_number text,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz
);

create index shipments_order_idx     on public.shipments (order_id)   where deleted_at is null;
create index shipments_shipped_idx   on public.shipments (shipped_at) where deleted_at is null;

create trigger shipments_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

alter table public.shipments enable row level security;

create policy shipments_select on public.shipments
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_role('packer')
      or exists (
        select 1 from public.orders o
        where o.id = shipments.order_id
          and public.current_user_has_branch(o.branch_id)
      )
    )
  );

create policy shipments_modify on public.shipments
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.shipments to authenticated;

-- -------- shipment_pallets --------------------------------------------------

create table public.shipment_pallets (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references public.shipments(id) on delete cascade,
  pallet_id    uuid not null references public.pallets(id)   on delete restrict,
  created_at   timestamptz not null default now(),
  unique (shipment_id, pallet_id)
);

create index shipment_pallets_shipment_idx on public.shipment_pallets (shipment_id);
create index shipment_pallets_pallet_idx   on public.shipment_pallets (pallet_id);

alter table public.shipment_pallets enable row level security;

create policy shipment_pallets_select on public.shipment_pallets
  for select to authenticated
  using (
    exists (
      select 1 from public.shipments s
      join public.orders o on o.id = s.order_id
      where s.id = shipment_pallets.shipment_id
        and s.deleted_at is null
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_role('packer')
          or public.current_user_has_branch(o.branch_id)
        )
    )
  );

create policy shipment_pallets_modify on public.shipment_pallets
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.shipment_pallets to authenticated;

comment on table public.pallets          is 'Packer-created pallets tied to an order (SPEC §6/§8.3).';
comment on table public.pallet_items     is 'Which order-item quantities ended up on which pallet (SPEC §6).';
comment on table public.shipments        is 'Outbound shipment with carrier + tracking (SPEC §6/§8.4).';
comment on table public.shipment_pallets is 'Many-to-many: a shipment can carry multiple pallets (SPEC §6).';
