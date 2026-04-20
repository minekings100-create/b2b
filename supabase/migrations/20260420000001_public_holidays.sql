-- 20260420000001_public_holidays.sql
-- Phase 7b-1 — public_holidays table for the working-days helper.
--
-- Wires actual NL public holidays into addWorkingDays / isWorkingDay so
-- the auto-cancel / awaiting-approval / overdue-invoice crons stop
-- counting Koningsdag, Hemelvaartsdag, Tweede Paasdag, etc. as working
-- days. Without this, an order submitted the working-day before a
-- holiday cluster (e.g. Pasen) would be auto-cancelled too aggressively.
--
-- Shape: one row per (region, date). region defaults to 'NL' so a
-- future regional holiday calendar (e.g. branch in another country)
-- can be added without another schema migration.
--
-- Loaded by `src/lib/dates/holidays.ts` and passed into the working-days
-- helper's existing `holidays` opt (already plumbed in the type, this
-- migration is what makes the data flow real).

create table public.public_holidays (
  id          uuid primary key default gen_random_uuid(),
  region      text not null default 'NL',
  date        date not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (region, date)
);

create index public_holidays_region_idx on public.public_holidays (region, date);

alter table public.public_holidays enable row level security;

-- Read: any authenticated user. The effective working-days calendar
-- surfaces in the UI (order due-dates, invoice due dates) so every role
-- needs read access. No per-branch scoping — public holidays are not
-- branch-confidential data.
create policy public_holidays_select on public.public_holidays
  for select to authenticated using (true);

-- Write: super_admin only. The admin UI for managing this table is a
-- Phase 7b-2 deliverable; until then super_admins manage rows directly
-- via the Supabase studio. The seed below covers 2026 + 2027 so this
-- isn't blocking for normal operation.
create policy public_holidays_modify on public.public_holidays
  for all to authenticated
  using (public.current_user_has_role('super_admin'))
  with check (public.current_user_has_role('super_admin'));

grant select, insert, update, delete on public.public_holidays to authenticated;

comment on table public.public_holidays is
  'NL (and future regional) public holidays. Loaded by src/lib/dates/holidays.ts and passed into the working-days helper so cron timeouts skip non-working days. SPEC §11 / Phase 7b-1.';

-- Seed — NL national public holidays for 2026 + 2027.
-- Variable-date holidays (Pasen / Hemelvaart / Pinksteren) are derived
-- from Easter Sunday: 2026 Easter = Apr 5, 2027 Easter = Mar 28.
-- Bevrijdingsdag (5 mei) is included for both years even though it is
-- only nationally recognised every 5th year (next: 2030); most office
-- and warehouse calendars treat it as a non-working day regardless,
-- which matches how this app's auto-cancel cadence should behave.
insert into public.public_holidays (region, date, name) values
  -- 2026
  ('NL', '2026-01-01', 'Nieuwjaarsdag'),
  ('NL', '2026-04-03', 'Goede Vrijdag'),
  ('NL', '2026-04-05', 'Eerste Paasdag'),
  ('NL', '2026-04-06', 'Tweede Paasdag'),
  ('NL', '2026-04-27', 'Koningsdag'),
  ('NL', '2026-05-05', 'Bevrijdingsdag'),
  ('NL', '2026-05-14', 'Hemelvaartsdag'),
  ('NL', '2026-05-24', 'Eerste Pinksterdag'),
  ('NL', '2026-05-25', 'Tweede Pinksterdag'),
  ('NL', '2026-12-25', 'Eerste Kerstdag'),
  ('NL', '2026-12-26', 'Tweede Kerstdag'),
  -- 2027
  ('NL', '2027-01-01', 'Nieuwjaarsdag'),
  ('NL', '2027-03-26', 'Goede Vrijdag'),
  ('NL', '2027-03-28', 'Eerste Paasdag'),
  ('NL', '2027-03-29', 'Tweede Paasdag'),
  ('NL', '2027-04-27', 'Koningsdag'),
  ('NL', '2027-05-05', 'Bevrijdingsdag'),
  ('NL', '2027-05-06', 'Hemelvaartsdag'),
  ('NL', '2027-05-16', 'Eerste Pinksterdag'),
  ('NL', '2027-05-17', 'Tweede Pinksterdag'),
  ('NL', '2027-12-25', 'Eerste Kerstdag'),
  ('NL', '2027-12-26', 'Tweede Kerstdag')
on conflict (region, date) do nothing;
