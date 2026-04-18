-- 20260418000007_hq_role_rls_and_packer_narrow.sql
-- Sub-milestone 3.2.2a — RLS for the HQ Manager role + tighten packer
-- visibility on `orders`.
--
-- Two changes to public.orders policies:
--
--   1. orders_select — add HQ Manager (cross-branch read), AND narrow the
--      existing packer clause from "see all orders" to "see orders that
--      have crossed both approvals" (status ∈ {approved, picking, packed,
--      shipped, delivered}). Packers don't need to see drafts, submitted,
--      branch_approved, rejected, closed, or cancelled — those are not
--      their concern, and the narrower view reduces queue noise for them.
--
--   2. orders_update — add HQ Manager (cross-branch update). Coarse policy
--      (decision S3): RLS enforces tenancy + role; the Server Action
--      enforces source-state and target-state transitions. Audit log +
--      Vitest RLS suite provide defense-in-depth.
--
-- order_items policies piggy-back on `orders` via EXISTS subqueries, so HQ
-- inherits read access transitively. Same for the
-- `audit_log_select_order_visible` policy added in 20260418000001 — its
-- EXISTS clause re-runs against `orders`, picking up HQ's new orders_select
-- grant automatically.

alter policy orders_select on public.orders
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_role('hq_operations_manager')
      or (
        public.current_user_has_role('packer')
        and status in (
          'approved'::public.order_status,
          'picking'::public.order_status,
          'packed'::public.order_status,
          'shipped'::public.order_status,
          'delivered'::public.order_status
        )
      )
      or public.current_user_has_branch(branch_id)
    )
  );

alter policy orders_update on public.orders
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('hq_operations_manager')
    or public.current_user_has_role('packer')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
    )
    or (
      public.current_user_has_role('branch_user')
      and public.current_user_has_branch(branch_id)
      and created_by_user_id = auth.uid()
    )
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or public.current_user_has_role('hq_operations_manager')
    or public.current_user_has_role('packer')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
    )
    or (
      public.current_user_has_role('branch_user')
      and public.current_user_has_branch(branch_id)
      and created_by_user_id = auth.uid()
    )
  );
