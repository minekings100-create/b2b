# Architecture

## Deployment
- **Next.js 14 App Router** on Vercel (production), `next dev` locally.
- **Supabase** EU region (project `aezwzijyutugvwxaxcmc`) — Postgres, Auth, Storage, Row Level Security.
- **Resend** — not yet wired; email hooks land in Phase 3.
- **Mollie** — iDEAL integration lands in Phase 6.

## Request flow
1. Browser → Vercel edge → Next.js App Router.
2. `middleware.ts` refreshes the Supabase session cookie via `@supabase/ssr`.
3. Server Components and Server Actions construct a per-request Supabase client (`src/lib/supabase/server.ts`) tied to the caller's session.
4. Mutations hit Postgres; RLS policies enforce tenancy (never just app-level checks).
5. From Phase 2 on, every mutation writes an `audit_log` row in the same transaction it mutates the target table.

## Data
- One HQ, many branches. Tenancy is encoded in `user_branch_roles` rows; RLS policies read the calling user's assignments via `public.current_user_roles()`.
- All monetary values are `integer cents`. Never floats.
- Timestamps are `timestamptz` stored in UTC, rendered in `Europe/Amsterdam`.
- Soft deletes use a `deleted_at` column. Unique indexes referenced by `ON CONFLICT` are non-partial so seed/import upserts land on their intended target; query paths filter `deleted_at IS NULL` explicitly.

## Clients
- `src/lib/supabase/browser.ts` — anon client for client components.
- `src/lib/supabase/server.ts` — per-request anon client tied to the session cookie. Used by Server Components + Server Actions.
- `src/lib/supabase/admin.ts` — service-role client. `import "server-only"` guarded; bypasses RLS. Legitimate uses: Server Actions that cross tenant boundaries (e.g. overdue-invoice cron in Phase 5).
- `scripts/seed/admin-client.ts` — service-role client for CLI scripts. Duplicates the admin client without the `server-only` guard, which throws when executed outside the Next bundler's `react-server` condition.

## Secrets
- `.env.local` holds `SUPABASE_SERVICE_ROLE_KEY` (server-only) and the anon/public URL/key. Each variable is documented in `docs/ENV.md`.
- Admin clients refuse to load without both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Activity timeline

Every entity that goes through a multi-actor lifecycle (orders, pallets, shipments, invoices, payments, returns) writes one `audit_log` row per state transition. The shared `<ActivityTimeline entries={…} />` component (`src/components/app/activity-timeline.tsx`) is the canonical UI for rendering that history. It accepts an array of `{ id, action, actor_email, created_at, after_json }` and produces a vertically-guided list with actor avatar (initials), human-friendly action label, payload-aware summary (e.g. "adjusted 2 lines qty down" for an `approve` row), absolute timestamp, and a relative-time `title` hover hint.

**Pattern for new entity types:**
1. Write to `audit_log` from the Server Action or trigger that performs the mutation. Use `entity_type = '<table_name>'`, `entity_id = <row id>`, `action = '<verb>'`. Stash a small, render-friendly payload in `after_json` — the timeline reads `approved_lines`, `reason`, `invoice_number` keys today; extend `summarisePayload` in the component for new keys.
2. Surface visibility by extending `audit_log_select` policies. The pattern (see `20260418000001`) is `entity_type = '<x>' AND EXISTS (SELECT 1 FROM <x> WHERE x.id = audit_log.entity_id)` — RLS on `<x>` then transitively scopes the audit row.
3. Pass the entries to `<ActivityTimeline />` from the Server Component that owns the detail page. Do not duplicate the markup.

Phase 4 will use this for `pallets` (`pack`, `ship`) and `shipments` (`deliver`); Phase 5 for `invoices` (`invoice_issue`, `invoice_paid`) and `payments`; Phase 6 for `returns` (`return_open`, `return_approve`, `credit_note_issue`).

## Testing
- **Vitest** — unit tests (`tests/lib/…`) and an RLS harness (`tests/rls/…`) that proves cross-branch reads are denied.
- **Playwright** — happy-path e2e (`tests-e2e/`) at 1440 / 768 / 375 viewports. `webServer` config auto-starts the dev server.
