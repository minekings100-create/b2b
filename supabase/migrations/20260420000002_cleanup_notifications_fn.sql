-- 20260420000002_cleanup_notifications_fn.sql
-- Phase 7b-1 — atomic notification cleanup function.
--
-- The 90-day cleanup cron must AUDIT the rows it deletes. Doing the
-- audit-insert and delete as two separate JS-side queries means a DB
-- error between them leaves notifications gone with no audit trail
-- (or audit rows for things still present, depending on order).
--
-- This function wraps SELECT → INSERT-audit → DELETE in a SINGLE SQL
-- statement using modifying CTEs, so it's one transaction frame:
-- either both the audit insert and the delete commit, or neither does.
--
-- Called by /api/cron/cleanup-notifications. Service-role only — the
-- cron uses createAdminClient(). The function does not need
-- SECURITY DEFINER because service_role already bypasses RLS.

create or replace function public.cleanup_old_notifications(
  p_cutoff         timestamptz,
  p_retention_days int,
  p_max_count      int
) returns table(deleted_count int, capped boolean)
language plpgsql
as $$
declare
  v_count int;
begin
  with candidates as (
    -- Snapshot the rows we intend to delete. Capped at p_max_count so
    -- a giant backlog gets chipped down across runs rather than
    -- exploding the audit_log in one go.
    select id, user_id, type, sent_at, read_at
    from public.notifications
    where sent_at < p_cutoff
      and read_at is not null
    order by sent_at asc
    limit p_max_count
  ),
  audited as (
    -- AUDIT FIRST. The `deleted` CTE below references this CTE's
    -- `entity_id` output, which (a) makes execution order explicit
    -- and (b) ensures audited can't be optimised away.
    insert into public.audit_log
      (entity_type, entity_id, action, actor_user_id, before_json, after_json)
    select
      'notification',
      c.id,
      'notification_cleanup',
      null,
      jsonb_build_object(
        'user_id', c.user_id,
        'type',    c.type,
        'sent_at', c.sent_at,
        'read_at', c.read_at
      ),
      jsonb_build_object(
        'retention_days', p_retention_days,
        'cron',           'cleanup-notifications'
      )
    from candidates c
    returning entity_id  -- = the notification id we just audited
  ),
  deleted as (
    delete from public.notifications
    where id in (select entity_id from audited)
    returning id
  )
  select count(*)::int into v_count from deleted;

  return query select v_count, v_count = p_max_count;
end;
$$;

revoke all on function public.cleanup_old_notifications(timestamptz, int, int) from public;
grant execute on function public.cleanup_old_notifications(timestamptz, int, int) to service_role;

comment on function public.cleanup_old_notifications(timestamptz, int, int) is
  'Phase 7b-1 — atomic 90-day notification cleanup. Audits BEFORE delete in a single SQL statement so a partial failure cannot leave deleted rows without an audit trail. Called from /api/cron/cleanup-notifications.';
