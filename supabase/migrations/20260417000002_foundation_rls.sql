-- 20260417000002_foundation_rls.sql
-- SPEC §3 · Row Level Security on every table. No exceptions.

-- -------- Helper functions ----------------------------------------------------

-- Current user's role list. SECURITY DEFINER so it does not re-enter the
-- policy system recursively when queried from a policy.
create or replace function public.current_user_roles()
returns table(role public.user_role, branch_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select role, branch_id
  from public.user_branch_roles
  where user_id = auth.uid()
    and deleted_at is null;
$$;

create or replace function public.current_user_has_role(target_role public.user_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_roles() where role = target_role
  );
$$;

-- Branch membership check that also returns true for global admins.
create or replace function public.current_user_has_branch(target_branch uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    target_branch is null
    or exists (
      select 1 from public.current_user_roles()
      where branch_id = target_branch
         or role in ('super_admin', 'administration')
    );
$$;

-- -------- branches ----------------------------------------------------------

alter table public.branches enable row level security;

-- Read: user sees their branch(es); admins and administration see all.
create policy branches_select on public.branches
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_has_branch(id)
  );

-- Insert: super_admin only.
create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.current_user_has_role('super_admin'));

-- Update: super_admin, or branch_manager of the same branch.
create policy branches_update on public.branches
  for update to authenticated
  using (
    public.current_user_has_role('super_admin')
    or (public.current_user_has_role('branch_manager') and public.current_user_has_branch(id))
  )
  with check (
    public.current_user_has_role('super_admin')
    or (public.current_user_has_role('branch_manager') and public.current_user_has_branch(id))
  );

-- Delete: super_admin only. Prefer soft-delete via update.
create policy branches_delete on public.branches
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- -------- users -------------------------------------------------------------

alter table public.users enable row level security;

-- Read: self; admins see all; branch_manager sees users in managed branches.
create policy users_select on public.users
  for select to authenticated
  using (
    deleted_at is null
    and (
      id = auth.uid()
      or public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or (
        public.current_user_has_role('branch_manager')
        and exists (
          select 1 from public.user_branch_roles ubr
          where ubr.user_id = users.id
            and ubr.branch_id in (
              select cur.branch_id from public.current_user_roles() cur
              where cur.role = 'branch_manager'
            )
        )
      )
    )
  );

-- Self-update (profile fields).
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin update.
create policy users_update_admin on public.users
  for update to authenticated
  using (public.current_user_has_role('super_admin'))
  with check (public.current_user_has_role('super_admin'));

-- Insert: blocked for everyone; the auth trigger handles mirroring.
create policy users_insert_block on public.users
  for insert to authenticated
  with check (false);

create policy users_delete_admin on public.users
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- -------- user_branch_roles -------------------------------------------------

alter table public.user_branch_roles enable row level security;

create policy ubr_select on public.user_branch_roles
  for select to authenticated
  using (
    deleted_at is null
    and (
      user_id = auth.uid()
      or public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or (
        public.current_user_has_role('branch_manager')
        and public.current_user_has_branch(branch_id)
      )
    )
  );

-- Insert:
--   - super_admin: unrestricted
--   - branch_manager: may add branch_user to own branch only
create policy ubr_insert on public.user_branch_roles
  for insert to authenticated
  with check (
    public.current_user_has_role('super_admin')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
      and role = 'branch_user'
    )
  );

create policy ubr_update on public.user_branch_roles
  for update to authenticated
  using (public.current_user_has_role('super_admin'))
  with check (public.current_user_has_role('super_admin'));

create policy ubr_delete on public.user_branch_roles
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- -------- grants ------------------------------------------------------------

revoke all on public.branches, public.users, public.user_branch_roles from anon;
grant  select, insert, update, delete on public.branches, public.users, public.user_branch_roles to authenticated;
grant  execute on function public.current_user_roles()           to authenticated;
grant  execute on function public.current_user_has_role(public.user_role) to authenticated;
grant  execute on function public.current_user_has_branch(uuid) to authenticated;
