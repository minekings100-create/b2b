-- 20260417000001_foundation_schema.sql
-- SPEC §6 · Identity & tenancy.
-- RLS policies land in a separate migration (20260417000002).

-- Extensions (uuid generation)
create extension if not exists "pgcrypto";

-- Role enum (SPEC §5)
create type public.user_role as enum (
  'branch_user',
  'branch_manager',
  'packer',
  'administration',
  'super_admin'
);

create type public.ui_theme as enum ('system', 'light', 'dark');

-- branches
create table public.branches (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  branch_code          text not null unique,
  email                text,
  phone                text,
  visiting_address     text,
  billing_address      text,
  shipping_address     text,
  kvk_number           text,
  vat_number           text,
  iban                 text,
  monthly_budget_cents bigint,
  payment_term_days    integer not null default 14 check (payment_term_days >= 0),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  deleted_at           timestamptz
);

create index branches_active_idx on public.branches (active) where deleted_at is null;

-- users (mirrors auth.users 1:1 via shared id)
create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  full_name  text,
  phone      text,
  active     boolean not null default true,
  ui_theme   public.ui_theme not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index users_active_idx on public.users (active) where deleted_at is null;

-- user_branch_roles — a user can hold multiple (role, branch) tuples
create table public.user_branch_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  branch_id  uuid references public.branches(id) on delete cascade,
  role       public.user_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique (user_id, branch_id, role)
);

-- admin + super_admin roles are branch-independent → branch_id is nullable,
-- but the tuple-unique constraint treats NULLs as distinct; enforce uniqueness
-- explicitly for branch-null rows.
create unique index user_branch_roles_admin_unique
  on public.user_branch_roles (user_id, role)
  where branch_id is null;

create index user_branch_roles_user_idx   on public.user_branch_roles (user_id)   where deleted_at is null;
create index user_branch_roles_branch_idx on public.user_branch_roles (branch_id) where deleted_at is null;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create trigger user_branch_roles_updated_at before update on public.user_branch_roles
  for each row execute function public.set_updated_at();

-- Auto-mirror auth.users → public.users on sign-up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on table public.branches          is 'Branch tenants (SPEC §6).';
comment on table public.users             is 'Mirror of auth.users with profile fields (SPEC §6).';
comment on table public.user_branch_roles is 'Assigns one or more (role, branch) tuples per user (SPEC §5).';
