-- 20260419000001_user_notification_preferences.sql
-- Sub-milestone 3.3.3a — per-user email + in-app notification preferences.
--
-- Shape: one JSONB column on `users` keyed by category with per-channel bools.
-- Default = everything on (most permissive); users opt out rather than opt in
-- (internal procurement tool, not marketing email). Future categories = add
-- an object key, no schema migration.
--
-- Categories:
--   state_changes — routine order lifecycle emails (submitted, approved,
--     rejected, cancelled, auto-cancelled, branch-approved, hq-rejected)
--     PLUS both reminder digests (submitted-awaiting-branch, branch-approved-
--     awaiting-hq). Reminders fold into state_changes because they share the
--     same audience and semantic thread.
--   admin_alerts — compliance signals. Currently only
--     `order_submitted_while_overdue`. Note: admin_alerts is the category,
--     but that one trigger is on the FORCED_EMAIL_TRIGGERS whitelist and
--     bypasses this preference for email. in_app for admin_alerts stays
--     toggleable.
--
-- Full trigger→category map lives in src/lib/email/categories.ts.
--
-- RLS: the existing `users` row policy (self + admin) already covers reads
-- and updates to this column; no new policy.

alter table public.users
  add column notification_preferences jsonb not null default
    '{"state_changes":{"email":true,"in_app":true},"admin_alerts":{"email":true,"in_app":true}}'::jsonb;

-- Explicit backfill. On PG 11+ the `add column` above already materialises
-- the default for existing rows virtually, so this UPDATE is a belt-and-
-- braces guarantee that every row has a valid pref object before any code
-- reads. Idempotent.
update public.users
set notification_preferences =
      '{"state_changes":{"email":true,"in_app":true},"admin_alerts":{"email":true,"in_app":true}}'::jsonb
where notification_preferences is null
   or notification_preferences = '{}'::jsonb;

comment on column public.users.notification_preferences is
  'Per-category × per-channel notification opt-in/out map (SPEC §11, 3.3.3a). Shape: { state_changes: { email, in_app }, admin_alerts: { email, in_app } }. Trigger→category mapping lives in src/lib/email/categories.ts alongside the FORCED_EMAIL_TRIGGERS whitelist that bypasses this preference for admin-level financial alerts.';
