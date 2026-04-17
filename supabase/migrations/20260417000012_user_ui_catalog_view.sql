-- 20260417000012_user_ui_catalog_view.sql
-- Phase 2.2+ addition — persistent catalog view preference (table vs grid).
-- Mirrors `ui_theme` in shape; RLS on `users` already covers this column.

create type public.ui_catalog_view as enum ('table', 'grid');

alter table public.users
  add column ui_catalog_view public.ui_catalog_view not null default 'table';

comment on column public.users.ui_catalog_view is
  'Persistent per-user catalog view toggle. Default `table`; grid is a denser image-forward layout.';
