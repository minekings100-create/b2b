-- 20260421000001_pack_queue_v2.sql
-- Phase 8 — Packer workflow v2.
--
-- Two independent features that both land on the `orders` table:
--
-- 1) Claim system. A packer can claim an order they're working on so
--    other packers don't duplicate the pick/pack. Claim auto-releases
--    after `PACK_CLAIM_TTL_MINUTES` (30) of wall-clock age — enforced
--    by the application layer (reads compare claimed_at against NOW()).
--    No server-side timer / trigger — keeps the DB simple; the age
--    check is cheap and runs exactly where it's consumed.
--
-- 2) Rush flag. Orders can be marked `is_rush`; the pack queue floats
--    rushed orders to the top regardless of FIFO. Set by the creator
--    at submit OR by HQ / admin on the order detail post-submit (but
--    only up to picking — after that it has no effect on the queue).
--
-- RLS: orders_update policy (20260418000007) already lets packer,
-- branch_manager-of-branch, HQ, and admin UPDATE rows. The app-layer
-- Server Actions additionally enforce the role/state-specific rules
-- (e.g. only the claim holder + admin can release; only creator at
-- submit / HQ / admin can flip rush). That's the same discipline as
-- Phase 3's approve / reject actions.

alter table public.orders
  add column claimed_by_user_id    uuid references public.users(id) on delete set null,
  add column claimed_at            timestamptz,
  add column is_rush               boolean not null default false,
  add column rush_set_by_user_id   uuid references public.users(id) on delete set null,
  add column rush_set_at           timestamptz;

-- Sanity: claim columns move together. If one is set the other must
-- be, and if one is cleared the other must be. CHECK constraints
-- rather than triggers — they run on every write for free.
alter table public.orders
  add constraint orders_claim_both_or_neither
  check (
    (claimed_by_user_id is null and claimed_at is null)
    or (claimed_by_user_id is not null and claimed_at is not null)
  );

-- Index: rush-first + FIFO is the default pack queue sort.
-- `is_rush DESC, approved_at ASC` — the btree covers both ways.
create index orders_pack_queue_idx
  on public.orders (is_rush desc, approved_at asc)
  where deleted_at is null and status in ('approved'::public.order_status, 'picking'::public.order_status);

-- Index: who-claimed-what. Small cardinality (at most the packer pool
-- size) but useful for "my active claims" dashboard queries.
create index orders_claimed_by_idx
  on public.orders (claimed_by_user_id)
  where claimed_by_user_id is not null;

comment on column public.orders.claimed_by_user_id is
  'Phase 8 — packer who currently holds the pick/pack claim. Cleared on release or when the app-layer age check (PACK_CLAIM_TTL_MINUTES) considers the claim expired.';
comment on column public.orders.claimed_at is
  'Phase 8 — when the current claim was placed. Compared against NOW() at queue-render time for the TTL check.';
comment on column public.orders.is_rush is
  'Phase 8 — rushed orders float to the top of the pack queue regardless of FIFO. Set by creator at submit OR by HQ / admin post-submit.';
comment on column public.orders.rush_set_by_user_id is
  'Phase 8 — audit of who flipped is_rush. Not the only source of truth — audit_log has the full trail with before/after.';
comment on column public.orders.rush_set_at is
  'Phase 8 — timestamp of the last is_rush flip.';
