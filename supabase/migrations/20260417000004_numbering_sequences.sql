-- 20260417000004_numbering_sequences.sql
-- SPEC §6 · numbering_sequences — gap-less per-year numbering for
-- invoices / orders / pallets. Phase 1 lays the table + allocator; actual
-- consumers land in later phases.

create table public.numbering_sequences (
  key        text primary key,
  next_value integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Allocator function: atomically returns the current value and increments.
-- SECURITY DEFINER so RLS doesn't block the write for non-admins.
create or replace function public.allocate_sequence(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.numbering_sequences (key, next_value)
  values (p_key, 1)
  on conflict (key) do nothing;

  update public.numbering_sequences
     set next_value = next_value + 1,
         updated_at = now()
   where key = p_key
  returning next_value - 1 into v_next;

  return v_next;
end;
$$;

alter table public.numbering_sequences enable row level security;

-- Only super_admin can read the raw counter; everyone allocates via the function.
create policy numbering_select on public.numbering_sequences
  for select to authenticated
  using (public.current_user_has_role('super_admin'));

-- No direct DML from clients; allocator has SECURITY DEFINER.
revoke insert, update, delete on public.numbering_sequences from authenticated;
grant  select                   on public.numbering_sequences to authenticated;
grant  execute on function public.allocate_sequence(text) to authenticated;
