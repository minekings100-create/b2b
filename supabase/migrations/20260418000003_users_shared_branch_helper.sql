-- 20260418000003_users_shared_branch_helper.sql
-- Sub-milestone 3.2.1 follow-up #2 — replace the broken
-- 20260418000002 policy with one backed by a SECURITY DEFINER helper.
--
-- Why the previous attempt failed: the `users_select_shared_branch` policy
-- joined `user_branch_roles target` against `current_user_roles()` to find
-- users who share a branch with the caller. The `target` query runs under
-- the caller's RLS, and `ubr_select` only lets a branch_user see her own
-- row — so `target` was always limited to her own assignments and the
-- EXISTS could never match the *other* user's row. Result: the policy
-- silently denied, the timeline still hid the approver's email.
--
-- The fix mirrors the existing `current_user_has_branch` helper: wrap the
-- shared-branch check in a SECURITY DEFINER function that runs with the
-- function-owner's privileges and so sees the full `user_branch_roles`
-- table. The policy then just calls the helper.

create or replace function public.user_shares_branch_with_caller(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_branch_roles target
    join public.user_branch_roles me
      on me.branch_id = target.branch_id
     and me.user_id = auth.uid()
     and me.deleted_at is null
    where target.user_id = target_user_id
      and target.deleted_at is null
      and target.branch_id is not null
  );
$$;

drop policy if exists users_select_shared_branch on public.users;

create policy users_select_shared_branch on public.users
  for select to authenticated
  using (
    deleted_at is null
    and public.user_shares_branch_with_caller(id)
  );
