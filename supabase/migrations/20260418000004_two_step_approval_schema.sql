-- 20260418000004_two_step_approval_schema.sql
-- Sub-milestone 3.2.2a — schema for two-step approval (Branch Manager →
-- HQ Manager). Behaviour change lands in 3.2.2b; this migration is purely
-- additive so the existing approve action keeps working until then.
--
-- Decisions (see docs/PROJECT-JOURNAL.md "3.2.2 plan"):
--   S1: keep `approved_at` / `approved_by_user_id` as the *final* (HQ)
--       approval. Add `branch_approved_at` / `branch_approved_by_user_id`
--       for step 1. No rename → existing reads/writes keep working.
--   S2: backfill historical `approved` rows so `branch_approved_*` is
--       populated, plus a synthetic `branch_approve` audit row dated
--       4 hours before the existing `approve` row, attributed to the same
--       approver. Lives in 20260418000006.

-- New status value, slotted between `submitted` and `approved`.
-- Postgres requires the BEFORE/AFTER literal to be quoted.
alter type public.order_status add value if not exists 'branch_approved'
  before 'approved';

alter table public.orders
  add column if not exists branch_approved_at timestamptz,
  add column if not exists branch_approved_by_user_id uuid
    references public.users(id) on delete set null;

-- Partial index used by the auto-cancel cron (3.2.2c) to find orders that
-- are sitting in step-2 longer than the timeout. Filtering by
-- `branch_approved_at IS NOT NULL` instead of by status keeps Postgres
-- from rejecting the migration: ALTER TYPE ADD VALUE just committed in
-- this same migration's transaction, and the new value cannot be
-- referenced until the COMMIT lands.
create index if not exists orders_branch_approved_idx
  on public.orders (branch_approved_at)
  where branch_approved_at is not null and deleted_at is null;

comment on column public.orders.branch_approved_at is
  'Step 1 timestamp — Branch Manager approval (SPEC §8.2). Final approval timestamp lives in approved_at (HQ Manager).';
comment on column public.orders.branch_approved_by_user_id is
  'Step 1 actor — Branch Manager who approved. Final approver lives in approved_by_user_id (HQ Manager).';
