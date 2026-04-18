-- 20260418000005_hq_operations_manager_role.sql
-- Sub-milestone 3.2.2a — add the HQ Manager role (SPEC §5).
--
-- HQ is global, so role assignments use NULL `branch_id`. The existing
-- `user_branch_roles_admin_unique` partial index (created in 20260417000001
-- for `super_admin` / `administration`) already enforces one row per
-- (user_id, role) when branch_id is NULL — covers HQ for free.

alter type public.user_role add value if not exists 'hq_operations_manager';
