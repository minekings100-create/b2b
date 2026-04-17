-- 20260417000003_audit_log.sql
-- SPEC §3 · audit_log on every critical mutation. Append-only.

create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      uuid not null,
  action         text not null,
  actor_user_id  uuid references public.users(id) on delete set null,
  before_json    jsonb,
  after_json     jsonb,
  created_at     timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_user_id, created_at desc);

-- RLS — append-only by virtue of only having select + insert policies.
alter table public.audit_log enable row level security;

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    or public.current_user_has_role('super_admin')
  );

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or actor_user_id = auth.uid()
  );

-- No update policy → updates are rejected by RLS.
-- No delete policy → deletes are rejected by RLS.

grant select, insert on public.audit_log to authenticated;
