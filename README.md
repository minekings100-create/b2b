# B2B Procurement Platform

Internal procurement platform for a single HQ and its branches: branches order from a shared catalog, HQ approves in two steps, the warehouse packs, invoices are issued, payments settle via iDEAL, and returns close the loop.

Built with **Next.js 14 (App Router) + TypeScript + Supabase (Postgres + RLS + Auth) + Tailwind**.

## Status

**MVP complete — Phase 7b-2d landed 2026-04-20.** Catalog, ordering, two-step approval, picking + packing, invoicing, online payment, RMA, dashboards, admin tooling (holidays, audit log, archive/restore), reports, and a WCAG 2.1 AA accessibility pass are all live. See [`docs/CHANGELOG.md`](docs/CHANGELOG.md) for the phase-by-phase history and [`docs/BACKLOG.md`](docs/BACKLOG.md) for post-MVP work.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure env (see docs/ENV.md)
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...

# 3. Apply migrations to your linked Supabase project
npm run db:push

# 4. Seed demo data (5 branches, 20 users, 500 products, orders across every state)
npm run seed:demo

# 5. Run dev server
npm run dev
#   → http://localhost:3000
```

Demo logins (all use password `demo-demo-1`):

| Email | Role |
|---|---|
| `super@example.nl` | super_admin |
| `admin@example.nl` | administration |
| `hq.ops@example.nl` | hq_operations_manager |
| `ams.mgr@example.nl` | branch_manager (Amsterdam) |
| `ams.user1@example.nl` | branch_user (Amsterdam) |
| `packer1@example.nl` | packer |

## What's in the box

- **Catalog** — admin CRUD, categories, CSV import, barcodes, product images.
- **Orders + two-step approval** — branch user submits → branch manager signs off (step 1) → HQ manager signs off (step 2). Inventory reservations at step 1. Auto-cancel at 2 / 3 working days via DST-aware cron.
- **Picking + packing** — tablet-first pack UI, pallet labels + pick list PDFs.
- **Invoicing** — draft → issue → paid/overdue. Gapless yearly numbering. PDF export. Nightly overdue cron with reminder ladder (7/14/30 days).
- **Payments** — Mollie iDEAL integration (mock transport in dev; swap via `MOLLIE_MODE`).
- **Returns (RMA)** — requested → approved → received → closed, with per-item restock or replace.
- **Notifications** — per-user email + in-app preferences, HMAC-signed unsubscribe links, 3.3.2 bell, reminder digests.
- **Admin tooling** — `/admin/holidays` (super_admin), `/admin/audit-log` (admin), archive/restore UX across products, categories, branches, users.
- **Reports** — spend by branch, top products, AR aging, packer throughput. CSV export per report.
- **Accessibility** — WCAG 2.1 AA pass over every key route.

## Running tests

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest (unit + RLS)
npm run test:e2e    # Playwright, desktop-1440 only by default
npm run test:e2e -- --project=tablet-768 --project=mobile-375 --project=desktop-1440  # full 3-viewport
```

See [`CLAUDE.md`](CLAUDE.md) § "Test discipline" for the default cadence. The a11y audit (`tests-e2e/a11y-scan-7b2d.spec.ts`) runs full 3-viewport per the CLAUDE.md carve-out for layout + accessibility work.

## Structure

```
src/
  app/               Next.js App Router
    (app)/           Authenticated shell (sidebar + top bar)
    api/             Route handlers (crons, webhooks, PDFs, CSV)
    login/           Auth entry
    unsubscribe/     Public token-verified page
  components/
    app/             App-shell + domain components
    ui/              Base design-system primitives (Button, Input, Table, …)
  lib/
    actions/         Server Actions (mutations)
    auth/            Session + role helpers
    db/              Read helpers (per feature)
    email/           Templates + transport + categories
    reports/         CSV builder
    supabase/        Typed clients (browser, server, admin)
    validation/      Zod schemas at trust boundaries
supabase/migrations/ Versioned SQL (RLS in the same migration as the table)
scripts/             Seed + demo seed + e2e cleanup
docs/                SPEC-adjacent docs (below)
tests/               Vitest suites (unit + RLS)
tests-e2e/           Playwright suites
```

## Documentation

- [`SPEC.md`](SPEC.md) — authoritative product + data spec. Read this first.
- [`CLAUDE.md`](CLAUDE.md) — working rules for contributors and for Claude Code.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit (request flow, RLS story, shared patterns like archive/restore, cron scheduling, reports).
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — phase-by-phase chronology.
- [`docs/PROJECT-JOURNAL.md`](docs/PROJECT-JOURNAL.md) — "what shipped when" single source of truth.
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — post-MVP queue + deferred scope.
- [`docs/ENV.md`](docs/ENV.md) — required env vars.

## License

Internal / private.
