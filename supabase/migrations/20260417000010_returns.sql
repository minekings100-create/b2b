-- 20260417000010_returns.sql
-- Phase 1.5 scaffolding — SPEC §6 RMA workflow (returns + return_items).
-- Schema-only; Phase 6 builds the approve/receive/resolve flows + credit
-- notes on top.

-- -------- enums -------------------------------------------------------------

create type public.return_status as enum (
  'requested',
  'approved',
  'rejected',
  'received',
  'processed',
  'closed'
);

create type public.return_item_condition as enum (
  'damaged',
  'wrong_item',
  'surplus',
  'other'
);

create type public.return_item_resolution as enum (
  'refund',
  'replace',
  'credit_note'
);

-- -------- returns -----------------------------------------------------------

create table public.returns (
  id                     uuid primary key default gen_random_uuid(),
  rma_number             text not null unique,
  order_id               uuid not null references public.orders(id) on delete restrict,
  branch_id              uuid not null references public.branches(id) on delete restrict,
  requested_by_user_id   uuid not null references public.users(id) on delete restrict,
  status                 public.return_status not null default 'requested',
  reason                 text,
  notes                  text,
  requested_at           timestamptz not null default now(),
  processed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  deleted_at             timestamptz
);

create index returns_branch_idx  on public.returns (branch_id) where deleted_at is null;
create index returns_order_idx   on public.returns (order_id)  where deleted_at is null;
create index returns_status_idx  on public.returns (status)    where deleted_at is null;

create trigger returns_updated_at before update on public.returns
  for each row execute function public.set_updated_at();

alter table public.returns enable row level security;

-- Read: admin + super globally; branch user/manager own branch.
create policy returns_select on public.returns
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_branch(branch_id)
    )
  );

-- Insert: branch_user / branch_manager on own branch, admin + super anywhere.
create policy returns_insert on public.returns
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

-- Update: admin + super drive approval/receipt/resolution; branch_manager
-- can edit notes on own-branch draft returns.
create policy returns_update on public.returns
  for update to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
      and status = 'requested'
    )
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
      and status in ('requested', 'approved', 'rejected')
    )
  );

create policy returns_delete on public.returns
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

grant select, insert, update, delete on public.returns to authenticated;

-- -------- return_items ------------------------------------------------------

create table public.return_items (
  id             uuid primary key default gen_random_uuid(),
  return_id      uuid not null references public.returns(id) on delete cascade,
  order_item_id  uuid not null references public.order_items(id) on delete restrict,
  quantity       integer not null check (quantity >= 1),
  condition      public.return_item_condition not null,
  resolution     public.return_item_resolution,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index return_items_return_idx     on public.return_items (return_id);
create index return_items_order_item_idx on public.return_items (order_item_id);

create trigger return_items_updated_at before update on public.return_items
  for each row execute function public.set_updated_at();

alter table public.return_items enable row level security;

create policy return_items_select on public.return_items
  for select to authenticated
  using (
    exists (
      select 1 from public.returns r
      where r.id = return_items.return_id
        and r.deleted_at is null
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_branch(r.branch_id)
        )
    )
  );

create policy return_items_modify on public.return_items
  for all to authenticated
  using (
    exists (
      select 1 from public.returns r
      where r.id = return_items.return_id
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or (
            public.current_user_has_role('branch_manager')
            and public.current_user_has_branch(r.branch_id)
            and r.status in ('requested', 'approved')
          )
          or (
            public.current_user_has_role('branch_user')
            and public.current_user_has_branch(r.branch_id)
            and r.status = 'requested'
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.returns r
      where r.id = return_items.return_id
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or (
            public.current_user_has_role('branch_manager')
            and public.current_user_has_branch(r.branch_id)
          )
          or (
            public.current_user_has_role('branch_user')
            and public.current_user_has_branch(r.branch_id)
            and r.status = 'requested'
          )
        )
    )
  );

grant select, insert, update, delete on public.return_items to authenticated;

comment on table public.returns       is 'RMA headers (SPEC §6/§8.7).';
comment on table public.return_items  is 'RMA line items with condition + resolution (SPEC §6).';
