-- 20260422000002_user_welcome_dismissed.sql
-- Post-MVP Sprint 3 — first-login welcome overlay dismissal timestamp.
--
-- New users see a small toast-style welcome card bottom-right on their first
-- dashboard visit. Clicking "Got it" or the X button stamps this column with
-- NOW() so the overlay never shows again for that user. Null = not yet
-- dismissed. We store the timestamp (not a bool) so we can later correlate
-- "who onboarded when" without a separate telemetry table.
--
-- RLS: no new policy. The users table already allows a user to read + update
-- their own row (self-service for ui_theme, ui_catalog_view). We extend the
-- existing users_self_update pattern — no migration-level change needed,
-- the column is covered by the existing UPDATE policy that checks
-- `id = auth.uid()`.

alter table public.users
  add column welcome_dismissed_at timestamptz;

comment on column public.users.welcome_dismissed_at is
  'Post-MVP Sprint 3 — first-login welcome overlay dismissal. Null = not yet shown/dismissed. Set via self-update from the dismissal button; audited so admins can confirm onboarding completion if ever needed.';
