# Changelog

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
