-- 20260417000011_notifications.sql
-- Phase 1.5 scaffolding — SPEC §6 notifications.
-- Schema-only; later phases emit rows from Server Actions + cron.

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  type         text not null,
  payload_json jsonb not null default '{}'::jsonb,
  sent_at      timestamptz not null default now(),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx    on public.notifications (user_id);
create index notifications_unread_idx  on public.notifications (user_id, read_at) where read_at is null;
create index notifications_sent_idx    on public.notifications (sent_at desc);

alter table public.notifications enable row level security;

-- Read: own notifications. Admins + super see everything.
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

-- Update: recipient can mark-as-read (flip read_at); admin + super
-- unrestricted. Stricter checks on which columns change land in Phase 3+
-- once the mutation surface is defined.
create policy notifications_update on public.notifications
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    user_id = auth.uid()
    or public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

-- Insert: admin + super only from the client surface. Server Actions using
-- the service-role key bypass RLS when emitting notifications as side
-- effects of other mutations.
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

grant select, insert, update, delete on public.notifications to authenticated;

comment on table public.notifications is 'Per-user notifications queue (SPEC §6). Emitted from Server Actions + cron.';
