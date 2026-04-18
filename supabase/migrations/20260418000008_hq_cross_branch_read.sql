-- 20260418000008_hq_cross_branch_read.sql
-- Sub-milestone 3.2.2a follow-up — HQ Manager visual verification on
-- /orders showed the Branch + Created By columns coming back empty even
-- though the orders themselves were visible (the policy added in
-- 20260418000007 already lets HQ SELECT every order). The empty cells
-- were the joined columns: branch.name and users.email weren't readable
-- by HQ because:
--
--   1. branches_select uses `current_user_has_branch(id)`, which only
--      short-circuits to true for super_admin / administration. HQ has
--      no `branch_id` assignment, so it failed every branch.
--   2. users_select has no clause for HQ. The shared-branch helper
--      (20260418000003) returns false because HQ shares zero
--      user_branch_roles rows.
--
-- Fix:
--   1. Extend `current_user_has_branch` so it also returns true for
--      `hq_operations_manager`. This cascades to every read policy that
--      uses the helper (branches, invoices, ...). HQ should have
--      cross-branch READ on those entities per SPEC §5; modify policies
--      stay gated on role checks (HQ has no role X for any of the
--      `(role=X AND has_branch)` patterns) so write access doesn't leak.
--   2. Add a dedicated `users_select_hq` OR-policy. Cleaner than threading
--      HQ through `user_shares_branch_with_caller` because HQ legitimately
--      needs *unrestricted* user reads (every order creator + approver,
--      cross-branch).

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
         or role in ('super_admin', 'administration', 'hq_operations_manager')
    );
$$;

create policy users_select_hq on public.users
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_has_role('hq_operations_manager')
  );
