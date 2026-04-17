-- 20260417000009_billing.sql
-- Phase 1.5 scaffolding — SPEC §6 invoices + line items + payments, with RLS.
-- Schema-only; Phase 5 builds the auto-draft-on-ship, PDF generation,
-- issue + email, and nightly overdue cron.

-- -------- enums -------------------------------------------------------------

create type public.invoice_status as enum (
  'draft',
  'issued',
  'paid',
  'overdue',
  'cancelled'
);

create type public.payment_method as enum (
  'manual_bank_transfer',
  'ideal_mollie',
  'credit_note',
  'other'
);

-- -------- invoices ----------------------------------------------------------

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null unique,
  order_id           uuid references public.orders(id) on delete set null,
  branch_id          uuid not null references public.branches(id) on delete restrict,
  issued_at          timestamptz,
  due_at             timestamptz,
  total_net_cents    bigint not null default 0 check (total_net_cents >= 0),
  total_vat_cents    bigint not null default 0 check (total_vat_cents >= 0),
  total_gross_cents  bigint not null default 0 check (total_gross_cents >= 0),
  status             public.invoice_status not null default 'draft',
  paid_at            timestamptz,
  payment_method     public.payment_method,
  mollie_payment_id  text,
  pdf_path           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  deleted_at         timestamptz
);

create index invoices_branch_idx  on public.invoices (branch_id)   where deleted_at is null;
create index invoices_status_idx  on public.invoices (status)      where deleted_at is null;
create index invoices_due_idx     on public.invoices (due_at)      where deleted_at is null;
create index invoices_order_idx   on public.invoices (order_id)    where deleted_at is null;

create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

-- Read: admin + super globally; branch user/manager for own branch.
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or public.current_user_has_branch(branch_id)
    )
  );

-- Write: admin + super only (SPEC §5 matrix).
create policy invoices_modify on public.invoices
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.invoices to authenticated;

-- -------- invoice_items (snapshot) ------------------------------------------

create table public.invoice_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  description       text not null,
  quantity          integer not null check (quantity >= 1),
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  vat_rate          integer not null check (vat_rate in (0, 9, 21)),
  line_net_cents    bigint not null default 0 check (line_net_cents >= 0),
  line_vat_cents    bigint not null default 0 check (line_vat_cents >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create trigger invoice_items_updated_at before update on public.invoice_items
  for each row execute function public.set_updated_at();

alter table public.invoice_items enable row level security;

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.deleted_at is null
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_branch(i.branch_id)
        )
    )
  );

create policy invoice_items_modify on public.invoice_items
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.invoice_items to authenticated;

-- -------- payments ----------------------------------------------------------

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  amount_cents         bigint not null check (amount_cents > 0),
  paid_at              timestamptz not null default now(),
  method               public.payment_method not null,
  reference            text,
  recorded_by_user_id  uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_paid_idx    on public.payments (paid_at);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

create policy payments_select on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.deleted_at is null
        and (
          public.current_user_has_role('super_admin')
          or public.current_user_has_role('administration')
          or public.current_user_has_branch(i.branch_id)
        )
    )
  );

create policy payments_modify on public.payments
  for all to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  )
  with check (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
  );

grant select, insert, update, delete on public.payments to authenticated;

comment on table public.invoices       is 'Issued invoices with lifecycle status (SPEC §6/§7/§8.6).';
comment on table public.invoice_items  is 'Snapshot of invoice lines at issue time (SPEC §6).';
comment on table public.payments       is 'Ledger of payments against invoices (SPEC §6).';
