# Changelog

## [Phase 3.2.1] — 2026-04-18

### Added
- Reusable `<ActivityTimeline>` and `<OrderStatusPill>` components in `src/components/app/`. The timeline ingests `audit_log` rows for any entity and renders actor avatars (initials), action label, payload summary (e.g. "adjusted 2 lines qty down"), absolute timestamp, and a relative-time hover hint. Phases 4 / 5 / 6 / 7 reuse the same component for pallets, invoices, payments, returns — see `ARCHITECTURE.md` § "Activity timeline".
- Status filter chips on `/orders` (`?status=submitted|approved|shipped|delivered|closed`), URL-driven and Zod-validated at the trust boundary.
- Approved-by column on `/orders`, populated via a follow-up `users` lookup keyed off `orders.approved_by_user_id`.
- Packer page scaffolds a "My completed" section so the Phase 4 layout is visible for visual review.
- Playwright coverage for clickable catalog rows, `Add to cart` not opening the drawer, the order timeline rendering an approver entry, and approver visibility for both super admin and the order's branch user.

### Changed
- Catalog rows are entirely clickable (table + grid). The table uses a thin client-side `CatalogRow` wrapper that ignores clicks originating inside `a / button / input / select / textarea / label / [data-row-stop]` so inline actions (e.g. future per-row Add-to-cart) won't open the drawer.
- `/orders/[id]` lifts the status pill to a prominent banner above the fold and replaces the inline timeline with the new shared component.
- `fetchOrderDetail` now returns `approved_by_email` so list and detail share a single source of truth.

### Database
- `20260418000001_audit_log_order_branch_select.sql` — adds an OR-policy on `audit_log` granting `SELECT` to anyone who can already `SELECT` the underlying order via the existing `orders_select` chain. Branch users can now see manager / packer / shipper actions on their own orders. Admins, packers, and other-branch users are unaffected by their existing scopes.

## [Phase 1] — 2026-04-17

### Added
- Hosted Supabase EU project, migrations pipeline (`supabase/migrations/`).
- Foundation schema: `users`, `branches`, `user_branch_roles`, `audit_log`, `numbering_sequences`.
- Minimum catalog schema (`product_categories`, `products`) to support seed data; full catalog (barcodes, inventory, inventory movements) lands in Phase 2.
- RLS policies on every new table, verified by a Vitest RLS harness that proves cross-branch access is denied.
- Email/password + magic-link auth, session-refresh middleware, auth callback + logout.
- App shell with role-aware sidebar wired to routes, `⌘K` / `Ctrl+K` command-palette skeleton.
- Role-aware empty dashboards for each role + empty stub pages for every Phase 2+ sidebar destination.
- Seed script (`npm run seed`, idempotent): 5 branches, 20 users across all roles, 10 categories, 500 procedurally-generated products.
- Playwright happy path across 3 viewports (1440 / 768 / 375) covering login-per-role, role-scoped sidebar visibility, and the command palette.

### Changed
- Dashboard re-asserts its session redirect defensively; Next renders layout + page in parallel so the page can't rely solely on the layout guard.
- `SidebarItem as="a"` uses Next `Link` internally (replaces a nested `<Link><a></a></Link>` pattern that produced invalid HTML).

## [Phase 0] — 2026-04-17

### Added
- Next.js 14 + Tailwind + `next-themes` scaffold.
- SPEC §4 design tokens and base components (`Button`, `Input`, `Table`, `Badge`, `Sidebar`, `PageHeader`, `EmptyState`, `SkeletonRow`, `Kbd`).
- `/design` route showcasing every component in every state, both themes.
- Playwright smoke at 1440 / 768 / 375 in light + dark.
