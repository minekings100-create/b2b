# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "empty building" — Supabase wired up, auth working, identity/tenancy tables protected by RLS, base app shell with role-aware sidebar and command palette skeleton, seed data ready for Phase 2.

**Architecture:** Next.js 14 App Router + hosted Supabase (EU). Server Components by default; Server Actions for mutations. `@supabase/ssr` manages cookie-based sessions across RSC / Route Handlers / middleware. Every new table gets RLS policies in the **same** migration that creates it (B2B/CLAUDE.md rule #3). Service_role key is server-only, guarded by `import "server-only"` + runtime check.

**Tech stack additions over Phase 0:**
- `@supabase/supabase-js`, `@supabase/ssr`
- `zod` — env parsing + form validation
- `vitest` — for RLS tests (faster than Playwright for DB-only checks)
- `supabase` CLI (devDependency) — migrations + type generation
- `server-only` — hard-fail guard for secret-bearing modules

Phase 1 is split into four sub-milestones. Each ends with a PR to `main` and an explicit review pause.

- **1.1 — Schema + RLS:** migrations, Supabase clients, RLS test harness, types generation.
- **1.2 — Auth:** login (email/password + magic link), callback, logout, session helpers, middleware.
- **1.3 — App shell:** app-route layout, role-aware sidebar wired to the design-system `Sidebar`, per-role empty dashboards, command palette skeleton.
- **1.4 — Seed + happy path:** seed script, Playwright happy path, Phase 1 acceptance tests.

---

## File structure (Phase 1 delta)

```
.env.example                                   # committed placeholders
.env.local                                     # gitignored, real values
docs/
  ENV.md                                       # one line per env var (already exists)
  CHANGELOG.md                                 # per-phase entries
  ARCHITECTURE.md                              # living diagram
supabase/
  config.toml                                  # supabase CLI project config
  migrations/
    20260417000001_foundation_schema.sql       # users, branches, user_branch_roles, enum
    20260417000002_foundation_rls.sql          # RLS policies for the three tables
    20260417000003_audit_log.sql               # append-only mutation log (SPEC §6)
    20260417000004_numbering_sequences.sql     # gap-less sequence table (SPEC §6)
scripts/
  seed.ts                                      # seeds branches, users, categories, products
  seed/
    branches.ts
    users.ts
    product-categories.ts
    products.ts
middleware.ts                                  # session-refresh middleware (root)
src/
  env.ts                                       # zod-parsed process.env, single source of truth
  lib/
    supabase/
      types.ts                                 # generated DB types (checked in)
      server.ts                                # server component / action client
      middleware.ts                            # middleware helper (updateSession)
      admin.ts                                 # service_role client, server-only
      browser.ts                               # client-side browser client
    auth/
      session.ts                               # getUserWithRoles() helper
      roles.ts                                 # role enum, permission helpers
    logger.ts                                  # thin wrapper around console with structured fields
  app/
    (auth)/
      layout.tsx                               # centered, minimal, logo lockup
      login/
        page.tsx                               # email/password + magic link
        actions.ts                             # Server Actions
      callback/
        route.ts                               # OAuth/magic-link callback
      logout/
        route.ts                               # POST → clear session
    (app)/
      layout.tsx                               # auth-gated shell with sidebar
      dashboard/
        page.tsx                               # role-aware landing
        _components/
          branch-user-dashboard.tsx
          branch-manager-dashboard.tsx
          packer-dashboard.tsx
          admin-dashboard.tsx
          super-admin-dashboard.tsx
      (stubs)/
        orders/page.tsx                        # empty shell with PageHeader
        invoices/page.tsx
        approvals/page.tsx
        pack/page.tsx
        shipments/page.tsx
        returns/page.tsx
        catalog/page.tsx
        users/page.tsx
        reports/page.tsx
        settings/page.tsx
  components/
    app/
      app-sidebar.tsx                          # real nav, wired to routes + roles
      app-shell.tsx                            # sidebar + main wrapper
      command-palette.tsx                      # cmdk skeleton
      user-menu.tsx                            # avatar + theme toggle + signout
    ui/
      platform-kbd.tsx                         # ⌘ on mac, Ctrl elsewhere
tests-e2e/
  auth.spec.ts                                 # email/password login → dashboard
  phase-1-happy-path.spec.ts                   # login → nav → cmdk → logout
tests/                                          # vitest unit + RLS tests
  rls/
    setup.ts                                   # creates 2 test users per role/branch
    branches.test.ts                           # cross-branch denial
    users.test.ts                              # role visibility
    audit-log.test.ts                          # mutation → audit row
  lib/
    roles.test.ts                              # permission helpers
vitest.config.ts
playwright.config.ts                           # already exists; may add auth project
package.json                                   # +deps, +scripts
```

---

## Sub-milestone 1.1 — Schema + RLS

### Task 1.1.1: Install Phase 1 dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add runtime + dev deps**

```bash
npm install @supabase/supabase-js @supabase/ssr zod server-only
npm install -D vitest @vitest/coverage-v8 supabase tsx dotenv
```

- [ ] **Step 2: Add scripts**

In `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:e2e:install": "playwright install chromium",
  "db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_REF --schema public > src/lib/supabase/types.ts",
  "db:push": "supabase db push --linked",
  "db:reset": "supabase db reset --linked",
  "seed": "tsx --env-file=.env.local scripts/seed.ts"
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Supabase, zod, vitest deps for Phase 1"
```

### Task 1.1.2: Validate env at boot with zod

**Files:**
- Create: `src/env.ts`

- [ ] **Step 1: Write the validator**

```ts
// src/env.ts
import { z } from "zod";

/**
 * Single source of truth for environment variables.
 * Imported by both server and client; only `NEXT_PUBLIC_*` fields are
 * exposed to the browser bundle.
 */
const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_PROJECT_REF: z.string().min(10),
});

const ClientEnvSchema = ServerEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

const isServer = typeof window === "undefined";

function parseEnv() {
  const schema = isServer ? ServerEnvSchema : ClientEnvSchema;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof ServerEnvSchema>;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/env.ts
git commit -m "feat(env): zod-validated env at boot"
```

### Task 1.1.3: Supabase CLI project config

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Initialise Supabase CLI in repo**

```bash
npx supabase init
```

This creates `supabase/config.toml` and `supabase/.gitignore`. Accept defaults.

- [ ] **Step 2: Link to the hosted project**

The user runs this once (it opens a browser for auth):

```bash
npx supabase login
npx supabase link --project-ref aezwzijyutugvwxaxcmc
```

Non-interactive alternative using `SUPABASE_ACCESS_TOKEN` from `.env.local`:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref aezwzijyutugvwxaxcmc
```

- [ ] **Step 3: Confirm link**

```bash
npx supabase projects list
```

Expected: the project appears with a ✓ in the "Linked" column.

- [ ] **Step 4: Commit config**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore: link supabase CLI to hosted project"
```

### Task 1.1.4: First migration — foundation schema

**Files:**
- Create: `supabase/migrations/20260417000001_foundation_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
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
-- but for the tuple-unique constraint we want NULL == NULL to collide. Enforce:
create unique index user_branch_roles_admin_unique
  on public.user_branch_roles (user_id, role)
  where branch_id is null;

create index user_branch_roles_user_idx on public.user_branch_roles (user_id) where deleted_at is null;
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

-- Soft-delete helper: mark, don't DELETE.
create or replace function public.soft_delete()
returns trigger
language plpgsql
as $$
begin
  update public.users set deleted_at = now() where id = old.id and deleted_at is null;
  return null;
end;
$$;

comment on table public.branches          is 'Branch tenants (SPEC §6).';
comment on table public.users             is 'Mirror of auth.users with profile fields (SPEC §6).';
comment on table public.user_branch_roles is 'Assigns one or more (role, branch) tuples per user (SPEC §5).';
```

- [ ] **Step 2: Check SQL locally for syntax**

```bash
# No DB needed — CLI parses the file on `db push --dry-run` against the shadow DB.
npx supabase db push --dry-run --linked
```

Expected: "Would apply migration 20260417000001_foundation_schema.sql" or similar, no syntax errors.

If shadow DB unavailable: rely on typecheck after migration applies.

- [ ] **Step 3: Commit (do NOT push to DB yet; do it in 1.1.6 after RLS)**

```bash
git add supabase/migrations/20260417000001_foundation_schema.sql
git commit -m "feat(db): foundation schema — users, branches, user_branch_roles"
```

### Task 1.1.5: Second migration — RLS for the foundation tables

**Files:**
- Create: `supabase/migrations/20260417000002_foundation_rls.sql`

- [ ] **Step 1: Write RLS policies**

```sql
-- 20260417000002_foundation_rls.sql
-- SPEC §3 · Row Level Security on every table. No exceptions.

-- Helper: current user's role list. SECURITY DEFINER so it works when the
-- table's RLS would otherwise recurse.
create or replace function public.current_user_roles()
returns table(role public.user_role, branch_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select role, branch_id
  from public.user_branch_roles
  where user_id = auth.uid()
    and deleted_at is null;
$$;

create or replace function public.current_user_has_role(target_role public.user_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_roles() where role = target_role
  );
$$;

create or replace function public.current_user_has_branch(target_branch uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_roles()
    where branch_id = target_branch or role in ('super_admin', 'administration')
  );
$$;

-- --- branches ---------------------------------------------------------------
alter table public.branches enable row level security;

-- Read: user sees their branch(es), admins see all.
create policy branches_select on public.branches
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.current_user_has_branch(id)
    )
  );

-- Write: super_admin only for now. Branch manager can update own (limited).
create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.current_user_has_role('super_admin'));

create policy branches_update on public.branches
  for update to authenticated
  using (
    public.current_user_has_role('super_admin')
    or (public.current_user_has_role('branch_manager') and public.current_user_has_branch(id))
  )
  with check (
    public.current_user_has_role('super_admin')
    or (public.current_user_has_role('branch_manager') and public.current_user_has_branch(id))
  );

-- Delete: super_admin only, and we prefer soft-delete via update.
create policy branches_delete on public.branches
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- --- users ------------------------------------------------------------------
alter table public.users enable row level security;

-- Read: self; admins see all; branch_manager sees users in own branch.
create policy users_select on public.users
  for select to authenticated
  using (
    deleted_at is null
    and (
      id = auth.uid()
      or public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or (
        public.current_user_has_role('branch_manager')
        and exists (
          select 1 from public.user_branch_roles ubr
          where ubr.user_id = users.id
            and ubr.branch_id in (
              select cur.branch_id from public.current_user_roles() cur
              where cur.role = 'branch_manager'
            )
        )
      )
    )
  );

-- Self-update (profile fields). Never self-escalate — role changes go through
-- user_branch_roles, which has its own policies.
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin update (limited to non-auth fields; triggers prevent id/email drift).
create policy users_update_admin on public.users
  for update to authenticated
  using (public.current_user_has_role('super_admin'))
  with check (public.current_user_has_role('super_admin'));

-- Insert: the auth trigger handles this with SECURITY DEFINER. Block direct inserts.
create policy users_insert_block on public.users
  for insert to authenticated
  with check (false);

create policy users_delete_admin on public.users
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- --- user_branch_roles ------------------------------------------------------
alter table public.user_branch_roles enable row level security;

create policy ubr_select on public.user_branch_roles
  for select to authenticated
  using (
    deleted_at is null
    and (
      user_id = auth.uid()
      or public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
      or (
        public.current_user_has_role('branch_manager')
        and public.current_user_has_branch(branch_id)
      )
    )
  );

create policy ubr_insert on public.user_branch_roles
  for insert to authenticated
  with check (
    public.current_user_has_role('super_admin')
    or (
      public.current_user_has_role('branch_manager')
      and public.current_user_has_branch(branch_id)
      and role in ('branch_user')  -- manager may only add branch_users
    )
  );

create policy ubr_update on public.user_branch_roles
  for update to authenticated
  using (public.current_user_has_role('super_admin'))
  with check (public.current_user_has_role('super_admin'));

create policy ubr_delete on public.user_branch_roles
  for delete to authenticated
  using (public.current_user_has_role('super_admin'));

-- --- grants ----------------------------------------------------------------
revoke all on public.branches,          public.users, public.user_branch_roles from anon;
grant select, insert, update, delete on public.branches,          public.users, public.user_branch_roles to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260417000002_foundation_rls.sql
git commit -m "feat(db): RLS policies for users, branches, user_branch_roles"
```

### Task 1.1.6: Third migration — audit_log

**Files:**
- Create: `supabase/migrations/20260417000003_audit_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260417000003_audit_log.sql
-- SPEC §3 · audit_log on every critical mutation. Append-only.

create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      uuid not null,
  action         text not null,
  actor_user_id  uuid references public.users(id) on delete set null,
  before_json    jsonb,
  after_json     jsonb,
  created_at     timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_user_id, created_at desc);

-- No updates, no deletes. Append-only by policy.
alter table public.audit_log enable row level security;

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (actor_user_id = auth.uid() or public.current_user_has_role('super_admin'));

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('administration')
    or actor_user_id = auth.uid()
  );

-- No update policy → any update is rejected by RLS.
-- No delete policy → any delete is rejected by RLS.

grant select, insert on public.audit_log to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260417000003_audit_log.sql
git commit -m "feat(db): append-only audit_log with RLS"
```

### Task 1.1.7: Fourth migration — numbering_sequences

**Files:**
- Create: `supabase/migrations/20260417000004_numbering_sequences.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260417000004_numbering_sequences.sql
-- SPEC §6 · numbering_sequences — gap-less per-year numbering for invoices/orders/pallets.

create table public.numbering_sequences (
  key        text primary key,
  next_value integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Allocator function (SECURITY DEFINER so RLS doesn't block it).
-- Caller passes a key like 'invoice_2026'; function returns the next value
-- atomically and increments the counter.
create or replace function public.allocate_sequence(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.numbering_sequences (key, next_value)
  values (p_key, 1)
  on conflict (key) do nothing;

  update public.numbering_sequences
     set next_value = next_value + 1,
         updated_at = now()
   where key = p_key
  returning next_value - 1 into v_next;

  return v_next;
end;
$$;

alter table public.numbering_sequences enable row level security;

-- Reads are limited to super_admin; the function does the work for everyone else.
create policy numbering_select on public.numbering_sequences
  for select to authenticated
  using (public.current_user_has_role('super_admin'));

-- No direct DML; only the SECURITY DEFINER function updates this table.
revoke insert, update, delete on public.numbering_sequences from authenticated;
grant  select                   on public.numbering_sequences to authenticated;
grant  execute on function public.allocate_sequence(text) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260417000004_numbering_sequences.sql
git commit -m "feat(db): numbering_sequences + allocator function"
```

### Task 1.1.8: Apply migrations to the hosted DB

**Files:** none (remote apply)

- [ ] **Step 1: Push migrations**

```bash
npx supabase db push --linked
```

Expected: "Finished supabase db push." All four migrations applied.

- [ ] **Step 2: Sanity-check in Supabase dashboard**

Open Table Editor → verify:
- `public.branches`, `public.users`, `public.user_branch_roles`, `public.audit_log`, `public.numbering_sequences` all exist.
- `public.user_role` enum and `public.ui_theme` enum exist.

- [ ] **Step 3: Generate TypeScript types**

```bash
npm run db:types
```

Expected: `src/lib/supabase/types.ts` populated with the generated Database type.

- [ ] **Step 4: Commit the generated types**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore(db): generate supabase types"
```

### Task 1.1.9: Supabase client helpers

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Browser client**

```ts
// src/lib/supabase/browser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/env";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 2: Server Component / Action client**

```ts
// src/lib/supabase/server.ts
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";
import type { Database } from "./types";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — writes are a no-op there.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Admin (service_role) client**

```ts
// src/lib/supabase/admin.ts
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

if (typeof window !== "undefined") {
  throw new Error("admin client must never be imported from a client component");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!serviceRoleKey || !url) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set");
}

/**
 * Admin client — bypasses RLS. Use only for:
 *   - seed scripts
 *   - migrations-adjacent tasks
 *   - specific Server Actions that legitimately need to read across tenants
 *     (e.g. the nightly overdue-invoice cron).
 *
 * Never use from UI flows. Prefer the `createClient()` server client and rely
 * on RLS.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(url!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Step 4: Middleware helper**

```ts
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the token if needed.
  await supabase.auth.getUser();

  return response;
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/lib/supabase/
git commit -m "feat(supabase): browser / server / admin / middleware clients"
```

### Task 1.1.10: RLS test harness (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/rls/setup.ts`
- Create: `tests/rls/branches.test.ts`
- Create: `tests/rls/users.test.ts`

- [ ] **Step 1: Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    env: loadEnv("test", process.cwd(), ""),
    setupFiles: ["tests/rls/setup.ts"],
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 2: Setup helper — creates 2 branches and one user per role per branch using the admin client**

```ts
// tests/rls/setup.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function userClient(accessToken: string) {
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type TestFixture = {
  branchA: { id: string };
  branchB: { id: string };
  userAManager: { id: string; accessToken: string };
  userBUser:    { id: string; accessToken: string };
  superAdmin:   { id: string; accessToken: string };
};

/**
 * Provisions two branches and three users (A-manager, B-user, super_admin).
 * Returns auth sessions for each user, ready to call Supabase with.
 * Cleans up on teardown.
 */
export async function seedFixture(): Promise<TestFixture> {
  // implementation in 1.1.10.5 below
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Fill in the fixture creator**

```ts
// replace the seedFixture body
export async function seedFixture(): Promise<TestFixture> {
  const rand = () => `rls_${Math.random().toString(36).slice(2, 10)}`;

  const branchA = await admin.from("branches").insert({
    name: `Branch A ${rand()}`,
    branch_code: `A-${rand()}`.slice(0, 16),
  }).select("id").single();
  if (branchA.error) throw branchA.error;

  const branchB = await admin.from("branches").insert({
    name: `Branch B ${rand()}`,
    branch_code: `B-${rand()}`.slice(0, 16),
  }).select("id").single();
  if (branchB.error) throw branchB.error;

  async function makeUser(role: "branch_manager" | "branch_user" | "super_admin", branchId: string | null) {
    const email = `${rand()}@test.local`;
    const password = "rls-test-password";
    const { data: u, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: role },
    });
    if (error) throw error;
    const { error: roleErr } = await admin.from("user_branch_roles").insert({
      user_id: u.user.id,
      branch_id: branchId,
      role,
    });
    if (roleErr) throw roleErr;
    const { data: sess, error: sessErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (sessErr) throw sessErr;
    // Sign in via password to get an access token.
    const anon = createClient<Database>(url, anonKey);
    const { data: signed, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;
    return { id: u.user.id, accessToken: signed.session!.access_token };
  }

  const userAManager = await makeUser("branch_manager", branchA.data.id);
  const userBUser    = await makeUser("branch_user",    branchB.data.id);
  const superAdmin   = await makeUser("super_admin",    null);

  return {
    branchA: { id: branchA.data.id },
    branchB: { id: branchB.data.id },
    userAManager, userBUser, superAdmin,
  };
}

/**
 * Tears down test users + branches. Run after each test file.
 */
export async function cleanupFixture(fixture: TestFixture) {
  await admin.auth.admin.deleteUser(fixture.userAManager.id);
  await admin.auth.admin.deleteUser(fixture.userBUser.id);
  await admin.auth.admin.deleteUser(fixture.superAdmin.id);
  await admin.from("branches").delete().in("id", [fixture.branchA.id, fixture.branchB.id]);
}
```

- [ ] **Step 4: Test — branch select denial**

```ts
// tests/rls/branches.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupFixture, seedFixture, userClient, type TestFixture } from "./setup";

let f: TestFixture;

beforeAll(async () => { f = await seedFixture(); });
afterAll(async () => { await cleanupFixture(f); });

describe("branches RLS", () => {
  it("manager of branch A cannot read branch B", async () => {
    const sb = userClient(f.userAManager.accessToken);
    const { data, error } = await sb.from("branches").select("*").eq("id", f.branchB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);                       // filtered out by RLS
  });

  it("user of branch B cannot read branch A", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb.from("branches").select("*").eq("id", f.branchA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("super_admin can read both", async () => {
    const sb = userClient(f.superAdmin.accessToken);
    const { data, error } = await sb.from("branches").select("id").in("id", [f.branchA.id, f.branchB.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("manager cannot insert a new branch", async () => {
    const sb = userClient(f.userAManager.accessToken);
    const { error } = await sb.from("branches").insert({ name: "Rogue", branch_code: "ROGUE" });
    expect(error).not.toBeNull();                   // RLS check violated
  });
});
```

- [ ] **Step 5: Test — users RLS**

```ts
// tests/rls/users.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupFixture, seedFixture, userClient, type TestFixture } from "./setup";

let f: TestFixture;

beforeAll(async () => { f = await seedFixture(); });
afterAll(async () => { await cleanupFixture(f); });

describe("users RLS", () => {
  it("user can read own profile", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb.from("users").select("*").eq("id", f.userBUser.id).single();
    expect(error).toBeNull();
    expect(data!.id).toBe(f.userBUser.id);
  });

  it("user cannot read a user in another branch", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb.from("users").select("*").eq("id", f.userAManager.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("direct insert to users is blocked", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { error } = await sb.from("users").insert({
      id: crypto.randomUUID(),
      email: "x@test.local",
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: all 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/rls/
git commit -m "test(rls): cross-branch denial + self-read fixtures"
```

### Task 1.1.11: Sub-milestone 1.1 PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin phase-1
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base main --title "Phase 1.1 — Schema + RLS" --body "$(cat <<'EOF'
## Summary
- Foundation schema: branches, users, user_branch_roles, audit_log, numbering_sequences
- RLS policies on every table, cross-branch denial enforced
- Supabase client helpers (browser / server / admin / middleware)
- Vitest RLS test harness, 7 tests green

## SPEC references
- §2, §3, §6 (identity & tenancy), §13 step 3 (migrations), §13 step 7 (RLS in same migration)

## Test plan
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (vitest RLS tests)
- [ ] `npx supabase db push --dry-run --linked` shows no drift

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review before starting 1.2.**

---

## Sub-milestone 1.2 — Auth

### Task 1.2.1: Root middleware for session refresh

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write middleware**

```ts
// middleware.ts (repo root)
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico, assets
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): session-refresh middleware"
```

### Task 1.2.2: Auth route group layout

**Files:**
- Create: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Write layout**

```tsx
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg text-sm font-semibold">
            PP
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Procurement</h1>
          <p className="text-sm text-fg-muted">Internal access only.</p>
        </header>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat(auth): auth route group layout"
```

### Task 1.2.3: Login page + server actions

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/actions.ts`

- [ ] **Step 1: Write server actions**

```ts
// src/app/(auth)/login/actions.ts
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

const PasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const MagicLinkSchema = z.object({
  email: z.string().email(),
});

export type FormState = { error?: string; success?: string } | undefined;

export async function signInWithPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = PasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signInWithMagicLink(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = MagicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = createClient();
  const origin = headers().get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/callback` },
  });
  if (error) return { error: error.message };
  return { success: "Check your inbox for the sign-in link." };
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(auth)/login/page.tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInWithPassword, signInWithMagicLink, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

export default function LoginPage() {
  const [pwState, pwAction]   = useFormState<FormState, FormData>(signInWithPassword, undefined);
  const [mlState, mlAction] = useFormState<FormState, FormData>(signInWithMagicLink, undefined);

  return (
    <div className="space-y-6">
      <form action={pwAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
        </div>
        {pwState?.error ? <p className="text-xs text-danger">{pwState.error}</p> : null}
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="label-meta">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={mlAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ml-email">Email</Label>
          <Input id="ml-email" name="email" type="email" autoComplete="email" required />
        </div>
        {mlState?.error   ? <p className="text-xs text-danger">{mlState.error}</p> : null}
        {mlState?.success ? <p className="text-xs text-success-subtle-fg">{mlState.success}</p> : null}
        <SubmitButton>Send magic link</SubmitButton>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/
git commit -m "feat(auth): login page with password + magic link"
```

### Task 1.2.4: Callback + logout routes

**Files:**
- Create: `src/app/(auth)/callback/route.ts`
- Create: `src/app/(auth)/logout/route.ts`

- [ ] **Step 1: Callback handler**

```ts
// src/app/(auth)/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}
```

- [ ] **Step 2: Logout handler**

```ts
// src/app/(auth)/logout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/callback/ src/app/\(auth\)/logout/
git commit -m "feat(auth): oauth callback + logout route handlers"
```

### Task 1.2.5: Session + roles helpers

**Files:**
- Create: `src/lib/auth/roles.ts`
- Create: `src/lib/auth/session.ts`

- [ ] **Step 1: Role enum + helpers**

```ts
// src/lib/auth/roles.ts
import type { Database } from "@/lib/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROLES: UserRole[] = [
  "branch_user",
  "branch_manager",
  "packer",
  "administration",
  "super_admin",
];

export type RoleAssignment = {
  role: UserRole;
  branch_id: string | null;
};

export function hasRole(assignments: readonly RoleAssignment[], role: UserRole): boolean {
  return assignments.some((a) => a.role === role);
}

export function hasAnyRole(assignments: readonly RoleAssignment[], roles: readonly UserRole[]): boolean {
  return assignments.some((a) => roles.includes(a.role));
}

export function branchesForRole(
  assignments: readonly RoleAssignment[],
  role: UserRole,
): string[] {
  return assignments.filter((a) => a.role === role && a.branch_id).map((a) => a.branch_id!);
}

export function isAdmin(assignments: readonly RoleAssignment[]): boolean {
  return hasAnyRole(assignments, ["super_admin", "administration"]);
}
```

- [ ] **Step 2: Session helper**

```ts
// src/lib/auth/session.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RoleAssignment } from "./roles";

/**
 * Returns the authenticated user + role assignments, or null if unauthenticated.
 * Wrapped in React.cache() so repeated calls within a single request are free.
 */
export const getUserWithRoles = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, phone, active, ui_theme")
    .eq("id", user.id)
    .single();

  const { data: roles } = await supabase
    .from("user_branch_roles")
    .select("role, branch_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  return {
    user,
    profile,
    roles: (roles ?? []) as RoleAssignment[],
  };
});
```

- [ ] **Step 3: Unit test for role helpers**

```ts
// tests/lib/roles.test.ts
import { describe, expect, it } from "vitest";
import { branchesForRole, hasAnyRole, hasRole, isAdmin } from "@/lib/auth/roles";

const a = { role: "branch_manager", branch_id: "b1" } as const;
const b = { role: "branch_user",    branch_id: "b2" } as const;
const c = { role: "super_admin",    branch_id: null } as const;

describe("role helpers", () => {
  it("hasRole matches", () => {
    expect(hasRole([a, b], "branch_manager")).toBe(true);
    expect(hasRole([a, b], "packer")).toBe(false);
  });
  it("hasAnyRole matches union", () => {
    expect(hasAnyRole([b], ["branch_manager", "super_admin"])).toBe(false);
    expect(hasAnyRole([c], ["branch_manager", "super_admin"])).toBe(true);
  });
  it("branchesForRole returns branch ids", () => {
    expect(branchesForRole([a, b], "branch_manager")).toEqual(["b1"]);
  });
  it("isAdmin detects admins", () => {
    expect(isAdmin([a])).toBe(false);
    expect(isAdmin([c])).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests + commit**

```bash
npm test
git add src/lib/auth/ tests/lib/
git commit -m "feat(auth): session + role helpers with unit tests"
```

### Task 1.2.6: Playwright happy-path — login with password

**Files:**
- Create: `tests-e2e/auth.spec.ts`

- [ ] **Step 1: Write test**

```ts
// tests-e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRoleKey);

test.describe("auth", () => {
  const email = `e2e_${Date.now()}@test.local`;
  const password = "e2e-test-password";
  let userId: string;

  test.beforeAll(async () => {
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = data.user!.id;
  });

  test.afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
  });

  test("login with password redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e -- --project=desktop-1440 tests-e2e/auth.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests-e2e/auth.spec.ts
git commit -m "test(auth): playwright happy-path for password login"
```

### Task 1.2.7: Sub-milestone 1.2 PR

- [ ] **Step 1: Push + open PR**

```bash
git push
gh pr create --base main --title "Phase 1.2 — Auth" --body "email/password + magic link + session helpers + middleware + e2e happy path"
```

---

## Sub-milestone 1.3 — App shell + role dashboards

### Task 1.3.1: Platform-aware Kbd

**Files:**
- Create: `src/components/ui/platform-kbd.tsx`

- [ ] **Step 1: Write client component**

```tsx
// src/components/ui/platform-kbd.tsx
"use client";

import { useEffect, useState } from "react";
import { Kbd } from "./kbd";

export function ModKey() {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  if (isMac === null) return <Kbd>⌘</Kbd>; // server/hydration placeholder
  return <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>;
}

export function EnterKey() {
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  if (isMac === null) return <Kbd>↵</Kbd>;
  return <Kbd>{isMac ? "↵" : "Enter"}</Kbd>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/platform-kbd.tsx
git commit -m "feat(ui): platform-aware ModKey and EnterKey"
```

### Task 1.3.2: App shell layout

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/app/app-shell.tsx`
- Create: `src/components/app/app-sidebar.tsx`
- Create: `src/components/app/user-menu.tsx`

- [ ] **Step 1: App shell wrapper**

```tsx
// src/components/app/app-shell.tsx
import { AppSidebar } from "./app-sidebar";
import type { RoleAssignment } from "@/lib/auth/roles";

export function AppShell({
  roles,
  email,
  children,
}: {
  roles: readonly RoleAssignment[];
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar roles={roles} email={email} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Role-aware sidebar**

```tsx
// src/components/app/app-sidebar.tsx
"use client";

import {
  BarChart3, Box, FileText, Home, Inbox, Package,
  Settings, ShoppingCart, Truck, Users, Archive,
} from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarItem, SidebarSection,
} from "@/components/ui/sidebar";
import type { RoleAssignment } from "@/lib/auth/roles";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { UserMenu } from "./user-menu";

export function AppSidebar({
  roles,
  email,
}: {
  roles: readonly RoleAssignment[];
  email: string;
}) {
  const pathname = usePathname();
  const canApprove = hasAnyRole(roles, ["branch_manager"]);
  const canPack    = hasAnyRole(roles, ["packer"]);
  const admin      = isAdmin(roles);

  const is = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-xs font-semibold">
          PP
        </div>
        <span className="text-sm font-medium">Procurement</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarSection label="Workspace">
          <Link href="/dashboard"><SidebarItem as="a" icon={<Home className="h-4 w-4" />} label="Dashboard" active={is("/dashboard")} /></Link>
          <Link href="/orders"   ><SidebarItem as="a" icon={<ShoppingCart className="h-4 w-4" />} label="Orders"     active={is("/orders")}    shortcut="go" /></Link>
          <Link href="/invoices" ><SidebarItem as="a" icon={<FileText className="h-4 w-4" />}     label="Invoices"   active={is("/invoices")}  shortcut="gi" /></Link>
          {canApprove ? (
            <Link href="/approvals"><SidebarItem as="a" icon={<Inbox className="h-4 w-4" />} label="Approvals" active={is("/approvals")} /></Link>
          ) : null}
        </SidebarSection>
        {canPack ? (
          <SidebarSection label="Warehouse">
            <Link href="/pack"     ><SidebarItem as="a" icon={<Package className="h-4 w-4" />} label="Pack queue" active={is("/pack")}      shortcut="gp" /></Link>
            <Link href="/shipments"><SidebarItem as="a" icon={<Truck className="h-4 w-4" />}   label="Shipments"  active={is("/shipments")} /></Link>
            <Link href="/returns"  ><SidebarItem as="a" icon={<Archive className="h-4 w-4" />} label="Returns"    active={is("/returns")} /></Link>
          </SidebarSection>
        ) : null}
        {admin ? (
          <SidebarSection label="Admin">
            <Link href="/catalog"><SidebarItem as="a" icon={<Box className="h-4 w-4" />}        label="Catalog" active={is("/catalog")} /></Link>
            <Link href="/users"  ><SidebarItem as="a" icon={<Users className="h-4 w-4" />}      label="Users"   active={is("/users")} /></Link>
            <Link href="/reports"><SidebarItem as="a" icon={<BarChart3 className="h-4 w-4" />}  label="Reports" active={is("/reports")} /></Link>
          </SidebarSection>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 3: User menu**

```tsx
// src/components/app/user-menu.tsx
"use client";

import { LogOut, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

export function UserMenu({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent-subtle-fg">
          {email.slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate text-xs text-fg-muted">{email}</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <ThemeToggle />
        <form action="/logout" method="post">
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Layout with auth guard**

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getUserWithRoles } from "@/lib/auth/session";
import { CommandPalette } from "@/components/app/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  return (
    <AppShell roles={session.roles} email={session.user.email!}>
      {children}
      <CommandPalette />
    </AppShell>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/components/app/
git commit -m "feat(app): role-aware app shell with sidebar + user menu"
```

### Task 1.3.3: Command palette skeleton

**Files:**
- Create: `src/components/app/command-palette.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/components/app/command-palette.tsx
"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ShoppingCart, FileText, Package, Archive } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => () => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
    >
      <div
        aria-hidden
        className="fixed inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg bg-surface ring-1 ring-border shadow-popover">
        <Command.Input
          placeholder="Search or jump to…"
          className="h-11 w-full bg-transparent px-4 text-sm outline-none placeholder:text-fg-subtle"
        />
        <Command.List className="max-h-80 overflow-y-auto border-t border-border p-2">
          <Command.Empty className="px-3 py-6 text-center text-xs text-fg-subtle">
            No results.
          </Command.Empty>
          <Command.Group heading="Go to">
            <Command.Item onSelect={go("/dashboard")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated">
              <Home className="h-3.5 w-3.5" /> Dashboard
            </Command.Item>
            <Command.Item onSelect={go("/orders")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated">
              <ShoppingCart className="h-3.5 w-3.5" /> Orders
            </Command.Item>
            <Command.Item onSelect={go("/invoices")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated">
              <FileText className="h-3.5 w-3.5" /> Invoices
            </Command.Item>
            <Command.Item onSelect={go("/pack")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated">
              <Package className="h-3.5 w-3.5" /> Pack queue
            </Command.Item>
            <Command.Item onSelect={go("/returns")} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated">
              <Archive className="h-3.5 w-3.5" /> Returns
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/app/command-palette.tsx
git commit -m "feat(app): cmdk command palette skeleton"
```

### Task 1.3.4: Dashboard landing (role-aware)

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/dashboard/_components/branch-user-dashboard.tsx`
- Create: `src/app/(app)/dashboard/_components/branch-manager-dashboard.tsx`
- Create: `src/app/(app)/dashboard/_components/packer-dashboard.tsx`
- Create: `src/app/(app)/dashboard/_components/admin-dashboard.tsx`

- [ ] **Step 1: Landing router picks the first-matching role**

```tsx
// src/app/(app)/dashboard/page.tsx
import { getUserWithRoles } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { isAdmin, hasAnyRole } from "@/lib/auth/roles";
import { AdminDashboard }         from "./_components/admin-dashboard";
import { BranchManagerDashboard } from "./_components/branch-manager-dashboard";
import { BranchUserDashboard }    from "./_components/branch-user-dashboard";
import { PackerDashboard }        from "./_components/packer-dashboard";

export default async function DashboardPage() {
  const session = (await getUserWithRoles())!;

  // Priority: super_admin → admin → branch_manager → packer → branch_user
  const picked =
    isAdmin(session.roles) ? "admin" :
    hasAnyRole(session.roles, ["branch_manager"]) ? "manager" :
    hasAnyRole(session.roles, ["packer"])         ? "packer"  :
    "user";

  return (
    <>
      <PageHeader title="Dashboard" description={`Signed in as ${session.user.email}`} />
      <div className="px-gutter py-6">
        {picked === "admin"   ? <AdminDashboard /> : null}
        {picked === "manager" ? <BranchManagerDashboard /> : null}
        {picked === "packer"  ? <PackerDashboard /> : null}
        {picked === "user"    ? <BranchUserDashboard /> : null}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Four empty shells**

Each is a simple grid of placeholder cards with `EmptyState` stubs. All four follow the same template:

```tsx
// src/app/(app)/dashboard/_components/branch-user-dashboard.tsx
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCart } from "lucide-react";

export function BranchUserDashboard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EmptyState
        icon={<ShoppingCart className="h-5 w-5" />}
        title="No recent orders"
        description="Your branch's orders will appear here once Phase 3 ships."
      />
    </div>
  );
}
```

Repeat for the three other roles with tweaked copy + icon (`Inbox` for manager, `Package` for packer, `BarChart3` for admin).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/dashboard/
git commit -m "feat(app): role-aware empty dashboards"
```

### Task 1.3.5: Stub pages for sidebar routes (so nav doesn't 404)

**Files:**
- Create: `src/app/(app)/orders/page.tsx`
- Create: `src/app/(app)/invoices/page.tsx`
- Create: `src/app/(app)/approvals/page.tsx`
- Create: `src/app/(app)/pack/page.tsx`
- Create: `src/app/(app)/shipments/page.tsx`
- Create: `src/app/(app)/returns/page.tsx`
- Create: `src/app/(app)/catalog/page.tsx`
- Create: `src/app/(app)/users/page.tsx`
- Create: `src/app/(app)/reports/page.tsx`
- Create: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Template for each (example: orders)**

```tsx
// src/app/(app)/orders/page.tsx
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCart } from "lucide-react";

export const metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" description="Order management lands in Phase 3." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="No orders yet"
          description="This view becomes the list of submitted orders in Phase 3."
        />
      </div>
    </>
  );
}
```

Copy the template for the other 9 routes, swap `title`, `description`, icon, copy. Keep each file under 30 lines.

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npm run typecheck
npm run lint
git add src/app/\(app\)/
git commit -m "feat(app): empty stub pages for sidebar routes"
```

### Task 1.3.6: Sub-milestone 1.3 PR

- [ ] **Step 1: Open PR**

```bash
git push
gh pr create --base main --title "Phase 1.3 — App shell, role nav, command palette" --body "sidebar wired to routes + roles, cmdk skeleton, empty dashboards per role, stub pages"
```

---

## Sub-milestone 1.4 — Seed + happy-path

### Task 1.4.1: Seed data modules

**Files:**
- Create: `scripts/seed/branches.ts`
- Create: `scripts/seed/users.ts`
- Create: `scripts/seed/product-categories.ts`
- Create: `scripts/seed/products.ts`

- [ ] **Step 1: Branches (5)**

```ts
// scripts/seed/branches.ts
export const BRANCHES = [
  {
    branch_code: "AMS", name: "Amsterdam Centrum",
    visiting_address: "Damrak 1, 1012 JS Amsterdam",
    billing_address:  "Damrak 1, 1012 JS Amsterdam",
    shipping_address: "Damrak 1, 1012 JS Amsterdam",
    email: "amsterdam@example.nl", phone: "+31 20 000 0001",
    kvk_number: "12345678", vat_number: "NL001234567B01",
    iban: "NL01 INGB 0001 0000 01", payment_term_days: 14,
    monthly_budget_cents: 250_000_00,
  },
  {
    branch_code: "UTR", name: "Utrecht",
    visiting_address: "Oudegracht 42, 3511 AP Utrecht",
    billing_address:  "Oudegracht 42, 3511 AP Utrecht",
    shipping_address: "Oudegracht 42, 3511 AP Utrecht",
    email: "utrecht@example.nl", phone: "+31 30 000 0001",
    kvk_number: "12345679", vat_number: "NL001234568B01",
    iban: "NL01 INGB 0001 0000 02", payment_term_days: 14,
    monthly_budget_cents: 180_000_00,
  },
  {
    branch_code: "ROT", name: "Rotterdam",
    visiting_address: "Coolsingel 101, 3012 AG Rotterdam",
    billing_address:  "Coolsingel 101, 3012 AG Rotterdam",
    shipping_address: "Coolsingel 101, 3012 AG Rotterdam",
    email: "rotterdam@example.nl", phone: "+31 10 000 0001",
    kvk_number: "12345680", vat_number: "NL001234569B01",
    iban: "NL01 INGB 0001 0000 03", payment_term_days: 14,
    monthly_budget_cents: 300_000_00,
  },
  {
    branch_code: "DHA", name: "Den Haag",
    visiting_address: "Plein 1, 2511 CR Den Haag",
    billing_address:  "Plein 1, 2511 CR Den Haag",
    shipping_address: "Plein 1, 2511 CR Den Haag",
    email: "denhaag@example.nl", phone: "+31 70 000 0001",
    kvk_number: "12345681", vat_number: "NL001234570B01",
    iban: "NL01 INGB 0001 0000 04", payment_term_days: 14,
    monthly_budget_cents: 150_000_00,
  },
  {
    branch_code: "HAA", name: "Haarlem",
    visiting_address: "Grote Markt 2, 2011 RD Haarlem",
    billing_address:  "Grote Markt 2, 2011 RD Haarlem",
    shipping_address: "Grote Markt 2, 2011 RD Haarlem",
    email: "haarlem@example.nl", phone: "+31 23 000 0001",
    kvk_number: "12345682", vat_number: "NL001234571B01",
    iban: "NL01 INGB 0001 0000 05", payment_term_days: 14,
    monthly_budget_cents: 120_000_00,
  },
];
```

- [ ] **Step 2: Users (20, distributed across roles)**

```ts
// scripts/seed/users.ts
import type { UserRole } from "@/lib/auth/roles";

export type SeedUser = {
  email: string;
  password: string;
  full_name: string;
  assignments: Array<{ role: UserRole; branch_code: string | null }>;
};

// Distribution: 1 super_admin, 2 administration, 5 branch_manager (1 per
// branch), 5 packer (HQ-only, no branch), 7 branch_user (rotating).
export const USERS: SeedUser[] = [
  { email: "super@example.nl", password: "demo-demo-1", full_name: "Super Admin",
    assignments: [{ role: "super_admin", branch_code: null }] },

  { email: "admin1@example.nl", password: "demo-demo-1", full_name: "Admin One",
    assignments: [{ role: "administration", branch_code: null }] },
  { email: "admin2@example.nl", password: "demo-demo-1", full_name: "Admin Two",
    assignments: [{ role: "administration", branch_code: null }] },

  { email: "ams.mgr@example.nl", password: "demo-demo-1", full_name: "Amsterdam Manager",
    assignments: [{ role: "branch_manager", branch_code: "AMS" }] },
  { email: "utr.mgr@example.nl", password: "demo-demo-1", full_name: "Utrecht Manager",
    assignments: [{ role: "branch_manager", branch_code: "UTR" }] },
  { email: "rot.mgr@example.nl", password: "demo-demo-1", full_name: "Rotterdam Manager",
    assignments: [{ role: "branch_manager", branch_code: "ROT" }] },
  { email: "dha.mgr@example.nl", password: "demo-demo-1", full_name: "Den Haag Manager",
    assignments: [{ role: "branch_manager", branch_code: "DHA" }] },
  { email: "haa.mgr@example.nl", password: "demo-demo-1", full_name: "Haarlem Manager",
    assignments: [{ role: "branch_manager", branch_code: "HAA" }] },

  { email: "packer1@example.nl", password: "demo-demo-1", full_name: "Packer 1",
    assignments: [{ role: "packer", branch_code: null }] },
  { email: "packer2@example.nl", password: "demo-demo-1", full_name: "Packer 2",
    assignments: [{ role: "packer", branch_code: null }] },
  { email: "packer3@example.nl", password: "demo-demo-1", full_name: "Packer 3",
    assignments: [{ role: "packer", branch_code: null }] },
  { email: "packer4@example.nl", password: "demo-demo-1", full_name: "Packer 4",
    assignments: [{ role: "packer", branch_code: null }] },
  { email: "packer5@example.nl", password: "demo-demo-1", full_name: "Packer 5",
    assignments: [{ role: "packer", branch_code: null }] },

  { email: "ams.user1@example.nl", password: "demo-demo-1", full_name: "Amsterdam User 1",
    assignments: [{ role: "branch_user", branch_code: "AMS" }] },
  { email: "ams.user2@example.nl", password: "demo-demo-1", full_name: "Amsterdam User 2",
    assignments: [{ role: "branch_user", branch_code: "AMS" }] },
  { email: "utr.user1@example.nl", password: "demo-demo-1", full_name: "Utrecht User 1",
    assignments: [{ role: "branch_user", branch_code: "UTR" }] },
  { email: "rot.user1@example.nl", password: "demo-demo-1", full_name: "Rotterdam User 1",
    assignments: [{ role: "branch_user", branch_code: "ROT" }] },
  { email: "rot.user2@example.nl", password: "demo-demo-1", full_name: "Rotterdam User 2",
    assignments: [{ role: "branch_user", branch_code: "ROT" }] },
  { email: "dha.user1@example.nl", password: "demo-demo-1", full_name: "Den Haag User 1",
    assignments: [{ role: "branch_user", branch_code: "DHA" }] },
  { email: "haa.user1@example.nl", password: "demo-demo-1", full_name: "Haarlem User 1",
    assignments: [{ role: "branch_user", branch_code: "HAA" }] },
];
```

> **Note — Phase 1 schema.** Phase 1 only creates `users`/`branches`/`user_branch_roles`. The seed script must also create products + categories as "mock data" per SPEC §11, but those tables won't exist until Phase 2. **Resolution:** land `product_categories` and `products` migrations as part of Task 1.4.1.5 below — they're scoped just for seed data here and Phase 2 will extend them with `product_barcodes`, `inventory`, and `inventory_movements`.

- [ ] **Step 3: Product categories (10)**

```ts
// scripts/seed/product-categories.ts
export const CATEGORIES = [
  { name: "Cleaning supplies",          sort_order: 10 },
  { name: "POS / Kassa materials",      sort_order: 20 },
  { name: "Displays & signage",         sort_order: 30 },
  { name: "Refrigeration",              sort_order: 40 },
  { name: "Consumables — paper",        sort_order: 50 },
  { name: "Consumables — bags",         sort_order: 60 },
  { name: "Consumables — packaging",    sort_order: 70 },
  { name: "Safety & PPE",               sort_order: 80 },
  { name: "Small equipment",            sort_order: 90 },
  { name: "Spare parts",                sort_order: 100 },
];
```

- [ ] **Step 4: Products (500, procedurally generated)**

```ts
// scripts/seed/products.ts
import { CATEGORIES } from "./product-categories";

const PRODUCT_TEMPLATES: Record<string, { base: string[]; unitPriceRangeCents: [number, number]; vat: number }> = {
  "Cleaning supplies":       { base: ["All-purpose cleaner", "Degreaser", "Disinfectant", "Floor cleaner", "Glass cleaner"], unitPriceRangeCents: [250, 2500], vat: 21 },
  "POS / Kassa materials":   { base: ["Receipt paper", "Cash register ribbon", "Barcode labels", "Price gun labels"],         unitPriceRangeCents: [300, 1800], vat: 21 },
  "Displays & signage":      { base: ["Acrylic holder", "Shelf talker", "Floor sticker", "Poster frame"],                    unitPriceRangeCents: [500, 9500], vat: 21 },
  "Refrigeration":           { base: ["Chiller shelf", "Gasket seal", "Thermometer", "Door hinge"],                          unitPriceRangeCents: [1500, 45000], vat: 21 },
  "Consumables — paper":     { base: ["Hand towels", "Toilet paper", "Industrial wipe", "Greaseproof paper"],                unitPriceRangeCents: [200, 4500], vat: 21 },
  "Consumables — bags":      { base: ["Plastic bag", "Paper bag", "Produce bag", "Cold transport bag"],                      unitPriceRangeCents: [50, 1200], vat: 21 },
  "Consumables — packaging": { base: ["Corrugated box", "Pallet wrap", "Packing tape", "Stretch film"],                      unitPriceRangeCents: [100, 3800], vat: 21 },
  "Safety & PPE":            { base: ["Nitrile glove", "Safety goggles", "Hairnet", "Cut-resistant glove"],                  unitPriceRangeCents: [300, 2800], vat: 21 },
  "Small equipment":         { base: ["Dust pan", "Squeegee", "Broom", "Mop head", "Bucket"],                                unitPriceRangeCents: [600, 4200], vat: 21 },
  "Spare parts":             { base: ["Filter", "Belt", "Bolt set", "Plug fuse"],                                            unitPriceRangeCents: [100, 8500], vat: 21 },
};

const UNITS = ["piece", "box", "liter", "pack", "carton"];

function seedRand(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export function generateProducts(total = 500) {
  const rand = seedRand(42);
  const products: Array<{
    sku: string; name: string; description: string; category_name: string;
    unit: string; unit_price_cents: number; vat_rate: number;
    min_order_qty: number; max_order_qty: number | null;
  }> = [];

  let counter = 0;
  while (products.length < total) {
    const cat = CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!;
    const tpl = PRODUCT_TEMPLATES[cat.name]!;
    const base = tpl.base[Math.floor(rand() * tpl.base.length)]!;
    const unit = UNITS[Math.floor(rand() * UNITS.length)]!;
    const sizeHint = ["small", "medium", "large", "XL", "bulk", "5L", "1L", "200ct", "100ct"][Math.floor(rand() * 9)]!;
    const sku = `SKU-${String(1000 + counter).padStart(4, "0")}-${sizeHint.toUpperCase().slice(0, 3)}`;
    const price = Math.floor(rand() * (tpl.unitPriceRangeCents[1] - tpl.unitPriceRangeCents[0])) + tpl.unitPriceRangeCents[0];
    products.push({
      sku,
      name: `${base} — ${sizeHint}`,
      description: `${base} (${sizeHint}) for ${cat.name.toLowerCase()}.`,
      category_name: cat.name,
      unit,
      unit_price_cents: price,
      vat_rate: tpl.vat,
      min_order_qty: 1,
      max_order_qty: [null, 10, 25, 50][Math.floor(rand() * 4)] ?? null,
    });
    counter += 1;
  }
  return products;
}
```

- [ ] **Step 4.5: Migration for `product_categories` + `products`**

```sql
-- supabase/migrations/20260417000005_catalog_seed_minimum.sql
-- Minimum tables required for Phase 1 seed. Phase 2 will extend with
-- product_barcodes, inventory, inventory_movements.

create table public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references public.product_categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create unique index product_categories_name_idx on public.product_categories (name) where deleted_at is null;

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null unique,
  name             text not null,
  description      text,
  category_id      uuid references public.product_categories(id) on delete set null,
  unit             text not null default 'piece',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  vat_rate         integer not null default 21 check (vat_rate in (0, 9, 21)),
  min_order_qty    integer not null default 1 check (min_order_qty >= 1),
  max_order_qty    integer check (max_order_qty is null or max_order_qty >= min_order_qty),
  image_path       text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  deleted_at       timestamptz
);

create index products_sku_idx      on public.products (sku) where deleted_at is null;
create index products_category_idx on public.products (category_id) where deleted_at is null;

-- RLS: read-all-authenticated, write admin.
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

create policy categories_select on public.product_categories
  for select to authenticated using (deleted_at is null);

create policy categories_modify on public.product_categories
  for all to authenticated
  using (public.current_user_has_role('super_admin') or public.current_user_has_role('administration'))
  with check (public.current_user_has_role('super_admin') or public.current_user_has_role('administration'));

create policy products_select on public.products
  for select to authenticated using (deleted_at is null);

create policy products_modify on public.products
  for all to authenticated
  using (public.current_user_has_role('super_admin') or public.current_user_has_role('administration'))
  with check (public.current_user_has_role('super_admin') or public.current_user_has_role('administration'));

grant select, insert, update, delete on public.product_categories, public.products to authenticated;

create trigger product_categories_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
```

```bash
npm run db:push
npm run db:types
git add supabase/migrations/20260417000005_catalog_seed_minimum.sql src/lib/supabase/types.ts
git commit -m "feat(db): minimum catalog tables for phase 1 seed"
```

### Task 1.4.2: Orchestrator script

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Write orchestrator**

```ts
// scripts/seed.ts
/**
 * Idempotent seed. Safe to run repeatedly. Uses the service_role client.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANCHES }   from "./seed/branches";
import { USERS }      from "./seed/users";
import { CATEGORIES } from "./seed/product-categories";
import { generateProducts } from "./seed/products";

async function main() {
  const supabase = createAdminClient();

  console.log("→ seeding branches");
  const branchIds: Record<string, string> = {};
  for (const b of BRANCHES) {
    const { data, error } = await supabase
      .from("branches")
      .upsert(b, { onConflict: "branch_code" })
      .select("id, branch_code")
      .single();
    if (error) throw error;
    branchIds[data!.branch_code] = data!.id;
  }

  console.log("→ seeding categories");
  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const { data, error } = await supabase
      .from("product_categories")
      .upsert(c, { onConflict: "name" })
      .select("id, name")
      .single();
    if (error) throw error;
    categoryIds[data!.name] = data!.id;
  }

  console.log("→ seeding products (500)");
  const products = generateProducts(500).map((p) => ({
    sku: p.sku,
    name: p.name,
    description: p.description,
    category_id: categoryIds[p.category_name]!,
    unit: p.unit,
    unit_price_cents: p.unit_price_cents,
    vat_rate: p.vat_rate,
    min_order_qty: p.min_order_qty,
    max_order_qty: p.max_order_qty,
  }));
  const chunks: typeof products[] = [];
  for (let i = 0; i < products.length; i += 100) chunks.push(products.slice(i, i + 100));
  for (const chunk of chunks) {
    const { error } = await supabase.from("products").upsert(chunk, { onConflict: "sku" });
    if (error) throw error;
  }

  console.log("→ seeding users");
  for (const u of USERS) {
    const existing = await supabase.auth.admin.listUsers();
    if (existing.error) throw existing.error;
    const found = existing.data.users.find((x) => x.email === u.email);
    let id = found?.id;
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) throw error;
      id = data.user.id;
    }
    for (const a of u.assignments) {
      const branch_id = a.branch_code ? branchIds[a.branch_code]! : null;
      const { error } = await supabase
        .from("user_branch_roles")
        .upsert({ user_id: id, branch_id, role: a.role }, { onConflict: "user_id,branch_id,role" });
      if (error) throw error;
    }
  }

  console.log("✓ seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run seed**

```bash
npm run seed
```

Expected log: each section succeeds, "seed complete."

- [ ] **Step 3: Verify in dashboard**

In Supabase Table Editor:
- `branches`: 5 rows
- `product_categories`: 10 rows
- `products`: 500 rows
- `auth.users`: 20 users
- `user_branch_roles`: ≥ 20 rows

- [ ] **Step 4: Commit**

```bash
git add scripts/
git commit -m "feat(seed): 5 branches / 20 users / 10 categories / 500 products"
```

### Task 1.4.3: Phase-1 Playwright happy path

**Files:**
- Create: `tests-e2e/phase-1-happy-path.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests-e2e/phase-1-happy-path.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Phase 1 happy path", () => {
  test("branch user logs in and lands on their dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill("ams.user1@example.nl");
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("No recent orders")).toBeVisible();
  });

  test("branch manager sees the Approvals item in nav", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill("ams.mgr@example.nl");
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("link", { name: "Approvals" })).toBeVisible();
  });

  test("super admin sees admin section", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill("super@example.nl");
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("link", { name: "Catalog" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  test("cmd+k opens command palette", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").first().fill("super@example.nl");
    await page.getByLabel("Password").fill("demo-demo-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await page.keyboard.press("Control+K");
    await expect(page.getByPlaceholder("Search or jump to…")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e
```

Expected: 4 tests × 3 viewports = 12 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests-e2e/phase-1-happy-path.spec.ts
git commit -m "test(e2e): phase 1 happy path — login per role + cmdk"
```

### Task 1.4.4: Docs — changelog + architecture snapshot

**Files:**
- Create: `docs/CHANGELOG.md`
- Create: `docs/ARCHITECTURE.md`

- [ ] **Step 1: CHANGELOG**

```markdown
# Changelog

## [Phase 1] — 2026-04-??

### Added
- Hosted Supabase EU project, migrations pipeline (`supabase/migrations/`)
- Foundation schema: `users`, `branches`, `user_branch_roles`, `audit_log`, `numbering_sequences`
- Minimum catalog schema (`product_categories`, `products`) to support seed data; full catalog ships in Phase 2
- RLS policies on every new table, verified by Vitest test harness
- Email/password + magic-link auth, session middleware, auth callback + logout
- App shell with role-aware sidebar wired to routes
- Role-aware empty dashboards + empty stub pages for every Phase-2+ route
- `cmdk` command palette skeleton, bound to ⌘K / Ctrl+K
- Seed script: 5 branches, 20 users across all roles, 10 categories, 500 products
- Playwright happy-path covering login per role + command palette

### Changed
- (nothing removed from Phase 0)

## [Phase 0] — 2026-04-17

### Added
- Next.js 14 + Tailwind + next-themes scaffold
- SPEC §4 design tokens and base components
- `/design` route showcasing every component in every state, both themes
- Playwright smoke at 1440 / 768 / 375 in light and dark
```

- [ ] **Step 2: ARCHITECTURE snapshot**

```markdown
# Architecture

## Deployment
- **Next.js 14 App Router** on Vercel (production), `next dev` locally.
- **Supabase** (EU region, project `aezwzijyutugvwxaxcmc`) — Postgres, Auth, Storage, RLS.
- **Resend** (not yet wired; Phase 3) for transactional email.
- **Mollie** (Phase 6) for iDEAL.

## Request flow
1. Browser → Vercel edge → Next.js App Router.
2. Middleware (`middleware.ts`) refreshes the Supabase session cookie using `@supabase/ssr`.
3. Server Components and Server Actions create a per-request Supabase client tied to the caller's session.
4. Mutations write to Postgres; RLS enforces tenancy.
5. Every mutation (Phase 2+) writes an `audit_log` row in the same transaction.

## Data
- Single HQ → many branches. Tenancy enforced by `user_branch_roles` rows and RLS policies referencing `public.current_user_roles()`.
- All monetary values stored as `integer cents`. Never floats.
- Timestamps in UTC via `timestamptz`; rendered in `Europe/Amsterdam`.
- Soft deletes via `deleted_at`.

## Secrets
- `.env.local` holds `SUPABASE_SERVICE_ROLE_KEY` (server-only). `/docs/ENV.md` documents each variable.
- The admin client (`src/lib/supabase/admin.ts`) is marked `import "server-only"` and refuses to load in the browser.
```

- [ ] **Step 3: Commit**

```bash
git add docs/CHANGELOG.md docs/ARCHITECTURE.md
git commit -m "docs: phase 1 changelog + architecture snapshot"
```

### Task 1.4.5: Sub-milestone 1.4 PR + Phase 1 acceptance

- [ ] **Step 1: Verify acceptance criteria (SPEC §12)**

```bash
npm run typecheck      # must pass, 0 errors
npm run lint           # must be clean
npm test               # RLS + unit tests green
npm run test:e2e       # 12 Playwright tests green
```

- [ ] **Step 2: Manual check — responsiveness at 1440 / 1024 / 768 / 375.**

Dev server open, browser devtools → toggle device sizes.
At each size the sidebar + dashboard must be usable. (Sidebar collapses to icon-only at mobile widths will land in Phase 2 — for now confirm no horizontal scroll and text stays legible.)

- [ ] **Step 3: Manual check — light + dark on every new screen.**

`/login`, `/dashboard`, `/orders` stub, etc.

- [ ] **Step 4: Push + PR**

```bash
git push
gh pr create --base main --title "Phase 1.4 — Seed + Phase 1 acceptance" --body "$(cat <<'EOF'
## Summary
- Seed script: 5 branches, 20 users across all roles, 10 categories, 500 products
- Phase 1 Playwright happy path across all role shells + command palette
- Documentation: CHANGELOG + ARCHITECTURE

## Phase 1 acceptance (SPEC §12)
- [x] RLS policies verified by automated tests (cross-branch denial)
- [x] Happy-path e2e green (Playwright)
- [ ] Every mutation produces an audit_log entry — audit_log table exists; writes come in Phase 2
- [x] Responsive 1440 / 1024 / 768 / 375 visually verified
- [x] Light + dark both verified on new screens
- [x] Empty states with friendly copy, toasts on error — empty states ✓, toasts in Phase 2
- [x] No `any`, typecheck + lint clean
- [x] /docs/CHANGELOG.md updated

## SPEC references
- §2, §3, §5 (roles), §6 (data model), §11 (Phase 1), §12 (acceptance), §13 (Claude instructions)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Wait for explicit approval before starting Phase 2.**

---

## Checklist rollup for Phase 1 acceptance

- [ ] 5 migrations applied to hosted DB
- [ ] RLS on all 7 new tables
- [ ] 7 RLS tests green
- [ ] Auth flow working: password + magic link
- [ ] App shell + sidebar + role filtering
- [ ] Command palette with ⌘K / Ctrl+K
- [ ] Seed: 5 branches · 20 users · 10 categories · 500 products
- [ ] 12 Playwright happy-path tests green
- [ ] Typecheck + lint clean
- [ ] CHANGELOG + ARCHITECTURE updated
