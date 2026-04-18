-- 20260418000001_audit_log_order_branch_select.sql
-- Sub-milestone 3.2.1 — surface the full order activity timeline to every
-- user who can see the order itself.
--
-- The original audit_log_select policy (20260417000003) only let admins or
-- the actor who wrote the row read it. That meant a branch user could see
-- their own "submit" entry on their order, but not the manager's "approve"
-- entry. The order detail timeline is the canonical record of who did what,
-- so we add an OR-policy that grants SELECT on order-scoped audit rows to
-- any user who has visibility on the underlying order via existing RLS.

create policy audit_log_select_order_visible on public.audit_log
  for select to authenticated
  using (
    entity_type = 'order'
    and exists (
      select 1
      from public.orders o
      where o.id = public.audit_log.entity_id
        -- Reuses the orders RLS chain transitively: the EXISTS sub-select
        -- runs under the caller's RLS, so it returns a row only when the
        -- caller can see that order.
    )
  );
