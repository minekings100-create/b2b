-- 20260419000002_order_edit.sql
-- Phase 3.4 — Order edit (SPEC §6 + §8.9).
--
-- Two schema changes:
--   1. Three new columns on `orders` for edit tracking.
--   2. New `order_edit_history` append-only table with before/after JSON
--      snapshots, RLS matching the orders-read taxonomy.
--
-- No enum changes — edits keep `status='submitted'`. The edit Server Action
-- will also reset `submitted_at=now()` so the §8.8 step-1 auto-cancel timer
-- restarts on each edit.

-- ---- orders columns ------------------------------------------------------

alter table public.orders
  add column edit_count              integer     not null default 0 check (edit_count >= 0),
  add column last_edited_at          timestamptz,
  add column last_edited_by_user_id  uuid references public.users(id) on delete set null;

comment on column public.orders.edit_count is
  'How many times this order has been edited while in `submitted` state (SPEC §8.9, 3.4).';
comment on column public.orders.last_edited_at is
  'Timestamp of the most recent pre-approval edit. Bumps `submitted_at` alongside to restart the step-1 auto-cancel timer.';
comment on column public.orders.last_edited_by_user_id is
  'Actor of the most recent edit (creator, BM-of-branch, admin, or super).';

-- ---- order_edit_history --------------------------------------------------

create table public.order_edit_history (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  edited_at           timestamptz not null default now(),
  edited_by_user_id   uuid references public.users(id) on delete set null,
  edit_reason         text,
  before_snapshot     jsonb not null,
  after_snapshot      jsonb not null
);

create index order_edit_history_order_idx  on public.order_edit_history (order_id, edited_at desc);
create index order_edit_history_actor_idx  on public.order_edit_history (edited_by_user_id, edited_at desc);

comment on table public.order_edit_history is
  'Append-only audit of pre-approval order edits (SPEC §6, 3.4). Retention revisited in Phase 7 alongside GDPR data-retention.';
comment on column public.order_edit_history.edit_reason is
  'Optional free-text reason. Plumbed but unused by the v1 UI (SPEC §8.9, open question 3). Available for a Phase 7 "why are you editing?" field.';

alter table public.order_edit_history enable row level security;

-- Read scope mirrors `orders_select` (foundation_rls + 3.2.2a HQ-cross-branch):
-- super_admin + administration always; hq_operations_manager always;
-- branch scopes (user / manager) restricted to their own branch via the
-- order's branch_id. Packers never see edit history — they receive the
-- order post-approval; the history is an approval-phase concern.
create policy order_edit_history_select on public.order_edit_history
  for select to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('hq_operations_manager')
    or exists (
      select 1 from public.orders o
      where o.id = order_edit_history.order_id
        and public.current_user_has_branch(o.branch_id)
    )
  );

-- Write: the `editOrder` Server Action writes via the user's session
-- client, so the RLS here governs who can insert. Mirrors the
-- "who can edit an order" rule from SPEC §8.9 — creator, BM of the
-- order's branch, administration, super_admin. NOT hq_operations_manager.
create policy order_edit_history_insert on public.order_edit_history
  for insert to authenticated
  with check (
    edited_by_user_id = auth.uid()
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or exists (
        select 1 from public.orders o
        where o.id = order_edit_history.order_id
          and o.status = 'submitted'
          and (
            o.created_by_user_id = auth.uid()
            or (public.current_user_has_role('branch_manager') and public.current_user_has_branch(o.branch_id))
          )
      )
    )
  );

-- No update / delete policies → append-only at the Postgres layer.
grant select, insert on public.order_edit_history to authenticated;
