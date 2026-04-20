-- 20260421000002_user_login_disabled.sql
-- Post-MVP Sprint 1 — admin-driven "deactivate login" flag.
--
-- Distinct from the existing `deleted_at` archive flag. Two orthogonal
-- switches, described in the Sprint 1 PR:
--
--   * `deleted_at IS NOT NULL` — archived. Hidden from pickers but can
--     still sign in. Reversible via Restore (7b-2b).
--   * `login_disabled = true` — admin disabled the account. User
--     literally cannot sign in. Reversible via Reactivate. Enforced by
--     the auth post-sign-in check in `src/middleware.ts`; Supabase Auth
--     (`auth.users`) is left untouched so our authorization layer
--     stays the single source of truth for login eligibility.
--
-- The choice between this and `auth.users.banned_until` was made in
-- the Sprint 1 PR thread: a dedicated boolean keeps "deactivated by
-- admin" and "banned for abuse/security" semantically separable. Real
-- bans in a later phase can use `banned_until` without colliding.

alter table public.users
  add column login_disabled boolean not null default false;

comment on column public.users.login_disabled is
  'Post-MVP Sprint 1 — admin-set flag. When true, the auth middleware signs the user out immediately after a successful Supabase Auth sign-in and surfaces "account deactivated" on /login. Orthogonal to deleted_at (archive).';

-- Partial index so the middleware check (`SELECT login_disabled WHERE
-- id = auth.uid()`) on every authenticated request stays cheap. Most
-- users never have the flag set, so the index is sparse.
create index users_login_disabled_idx
  on public.users (id)
  where login_disabled = true;
