-- 20260418000002_users_select_shared_branch.sql
-- Sub-milestone 3.2.1 follow-up — fix the activity timeline for branch users.
--
-- The 20260418000001 audit_log policy correctly let branch users see the
-- audit row that records "manager X approved your order". But the order
-- detail page hydrates each audit row with the actor's email via a follow-up
-- `select id, email from users` query — and the original `users_select`
-- policy (20260417000002) gives branch users no read access to other users'
-- rows. So the timeline showed "system" where it should have shown the
-- approver's email.
--
-- Fix: grant SELECT on a user row to any authenticated caller who shares a
-- `user_branch_roles` assignment with that user. This is the same scoping
-- the existing branch_manager clause uses (managers can see users in their
-- managed branches); we extend it symmetrically to every role assigned to a
-- branch. Cross-branch isolation is preserved — ams.user1 still cannot see
-- rdm.mgr because they don't share a branch.

create policy users_select_shared_branch on public.users
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.user_branch_roles target
      join public.current_user_roles() me
        on me.branch_id = target.branch_id
      where target.user_id = public.users.id
        and target.deleted_at is null
        and target.branch_id is not null
    )
  );
