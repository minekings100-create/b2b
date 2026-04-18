-- 20260418000006_two_step_backfill_legacy.sql
-- Sub-milestone 3.2.2a — backfill historical approvals so the new
-- two-step model has consistent data (decision S2 in PROJECT-JOURNAL.md).
--
-- For every order that ever crossed approval (any post-`approved` state +
-- has `approved_at` populated):
--   1. Set `branch_approved_at = approved_at - interval '4 hours'`
--      and `branch_approved_by_user_id = approved_by_user_id`. The 4h
--      gap is arbitrary but plausible — most legacy approvals went
--      through a manager-then-admin sign-off out-of-band; we attribute
--      both to the recorded approver.
--   2. Insert a synthetic `branch_approve` audit row dated 4h earlier,
--      with `after_json.synthetic = true` so the timeline can render a
--      subtle "(reconstructed from legacy single-step)" hint.
--
-- Idempotency: the backfill skips orders where `branch_approved_at` is
-- already set (re-running the migration via `supabase db reset` is safe).
-- The audit insert filters out orders that already have a `branch_approve`
-- row for the same entity_id.

update public.orders
   set branch_approved_at = approved_at - interval '4 hours',
       branch_approved_by_user_id = approved_by_user_id
 where approved_at is not null
   and approved_by_user_id is not null
   and branch_approved_at is null
   and status in (
     'approved', 'picking', 'packed', 'shipped', 'delivered', 'closed'
   )
   and deleted_at is null;

insert into public.audit_log (entity_type, entity_id, action, actor_user_id, after_json, created_at)
select
  'order'                              as entity_type,
  o.id                                 as entity_id,
  'branch_approve'                     as action,
  o.approved_by_user_id                as actor_user_id,
  jsonb_build_object(
    'status', 'branch_approved',
    'synthetic', true,
    'reason', 'backfilled by 20260418000006 — pre-3.2.2 single-step approval'
  )                                    as after_json,
  o.branch_approved_at                 as created_at
from public.orders o
where o.branch_approved_at is not null
  and o.approved_by_user_id is not null
  and not exists (
    select 1
      from public.audit_log a
     where a.entity_type = 'order'
       and a.entity_id   = o.id
       and a.action      = 'branch_approve'
  );
