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

## Reports (Phase 7b-2c)

The `/reports` tree is a set of admin/HQ-scoped aggregate views over existing tables. Each report is its own sub-route with a URL-driven date window (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) and a matching CSV export at `/api/reports/[kind]/csv`.

**Access model.** `src/lib/auth/reports.ts` is the single source of truth for per-report visibility. The same `canSeeReport(kind, roles)` predicate drives:
1. The `/reports` index card list (`reportsVisibleTo`).
2. Each page's `redirect("/dashboard")` guard.
3. The CSV route's 403 check.

Today: admin sees all four; HQ Manager sees three (no AR aging); everyone else is redirected.

**Data layer.** `src/lib/db/reports.ts` holds one fetch helper per report, all using the admin (service-role) client because every report is cross-branch. Pages/routes are the security boundary via `canSeeReport`; RLS isn't load-bearing because most reports inherently span every branch.

**Window parser.** `src/app/(app)/reports/_lib/window.ts` — Zod-parses `?from&to`, defaults to the last 30 days in UTC. Shared between the pages and the CSV route so a page link and its CSV export produce identical rows.

**CSV builder.** `src/lib/reports/csv.ts` — tiny RFC 4180-flavoured builder, no external dep. `centsToDecimalString` formats bigint cents as `"12.34"` for spreadsheet-friendly decimals. One route handler `/api/reports/[kind]/csv` dispatches by kind (404 for unknown, 403 for disallowed role, 200 for allowed).

**Sidebar placement.** Reports lives in a new "Insights" section (separate from "Admin") because HQ Manager legitimately sees it now; grouping it with admin write surfaces was misleading.

## Archive / Restore UX (Phase 7b-2b)

Every entity with a `deleted_at` column surfaces a consistent archive/restore pattern:

- **URL-driven filter** via `?archived=1` on each list. Default (off) shows active rows only; on shows the soft-deleted set only. Survives refresh, shareable.
- **Primitives:** `<ArchivedToggle>` and `<ArchivedBadge>` in `src/components/app/archived-primitives.tsx` — two tiny components used by every archive-aware list.
- **Archive** = UPDATE `{ active: false, deleted_at: NOW() }`. **Restore** = inverse. Both write one `audit_log` row (`action='archive' | 'restore'`).
- **Archive confirm** is a two-step inline swap on the row (no modal); **Restore** is single-click.
- **Rendering:** archived rows get `opacity-60` to read visually distinct; the badge sits next to the row's primary column.

Wired surfaces (all admin-only reads and writes):
- `/catalog` — products. Archived view uses a dedicated `<ArchivedProductsTable>` (no click-through-to-detail).
- `/catalog/categories` — categories. Archived view reuses the main table with the badge + Restore button.
- `/branches` — NEW list page. Read-only attributes + archive/restore. Create/edit deferred until user provisioning phase.
- `/users` — stub → full list. Self-archive blocked. Soft archive only — does NOT touch `auth.users`, so archived users with active sessions can still reach the app until their cookie expires.

Implementation note on the UPDATE path for branches + users: `branches_update` / `users_update` RLS rejects column-level writes to `deleted_at` from the session client even for super_admin (other column updates pass). The archive/restore Server Actions use the service-role client for the UPDATE; `isAdmin(session.roles)` at the action layer is the security boundary. Audit row writes still go via the session client so `actor_user_id` binds to the authenticated user, not service role.

## Admin surfaces (Phase 7b-2a)

Admin-only pages live under `/admin/<thing>`:

- `/admin/holidays` — super_admin only (both page + mutations). Manages `public_holidays` rows with add / edit / delete. Each mutation writes one `audit_log` row (`entity_type='public_holiday'`, `action='holiday_{created,updated,deleted}'`). The super_admin split (vs. `isAdmin`, which also includes `administration`) is enforced by the new `isSuperAdmin()` helper in `src/lib/auth/roles.ts`.
- `/admin/audit-log` — admin (super_admin + administration). URL-driven filter bar (entity_type, action, actor email, since/until) + offset pagination (50 rows/page). Zod parse at the page trust boundary. The `actor_email → actor_user_id` resolution happens server-side so the DB query stays an indexed equality match; an unknown email short-circuits to an empty page with a helpful message rather than returning the full unfiltered set.

Both pages reuse the existing `PageHeader` + `Table` primitives and the `useFormState`/`useFormStatus` form pattern from `/catalog/categories`.

## Cron scheduling (Phase 7b-1)

Vercel Cron schedules are UTC and have no native timezone support. To run a cron at a fixed Europe/Amsterdam local hour year-round, this codebase uses a **double-schedule + in-handler hour gate** pattern:

1. `vercel.json` registers TWO UTC schedules per cron — one matching CET (UTC+1, winter), one matching CEST (UTC+2, summer). Example for "08:00 Amsterdam":
   ```json
   { "path": "/api/cron/auto-cancel-stale-orders", "schedule": "0 6 * * *" },
   { "path": "/api/cron/auto-cancel-stale-orders", "schedule": "0 7 * * *" }
   ```
2. Each cron handler calls `isExpectedAmsterdamHour(TARGET_AMS_HOUR)` from `src/lib/dates/dst-cron.ts` near the top of `GET`. The off-DST-half firing returns `{ ok: true, skipped: true, reason: "outside_target_hour" }` and does no work.
3. The gate is **production-only** — skipped when `CRON_SECRET` is unset. Tests hit the cron route directly at arbitrary clock times.

NL public holidays are loaded by `src/lib/dates/holidays.ts` (`loadActiveHolidays(db, 'NL')`) and threaded into `addWorkingDays` calls in the auto-cancel cron so a holiday cluster (e.g. Pasen Mon) doesn't count as elapsed working days. The loader is fail-soft (logs + returns `[]`) so a transient DB hiccup degrades to pre-7b-1 Mon–Fri-only behaviour rather than crashing the sweep.

The destructive 90-day notifications cleanup cron (`/api/cron/cleanup-notifications`) is also DST-gated. Its actual SELECT → audit-INSERT → DELETE work happens inside the SQL function `public.cleanup_old_notifications` (migration `20260420000002`), wrapped as three modifying CTEs in a single statement so audit and delete commit or roll back together — a partial failure cannot leave deleted rows without an audit trail.

## Sortable list headers (Phase 7a)

`/orders`, `/invoices`, `/returns` lists support URL-driven sort via `?sort=<col>&dir=asc|desc`. Pattern:

- Page-level Zod parse against a per-page enum of allowed columns at the trust boundary (matches the `?status=` filter pattern).
- `<SortableHeader column={...} current={...} preserveParams={...}>` renders the cycle (asc → desc → reset). Reset drops the params entirely (matches BACKLOG spec).
- DB layer (`fetchVisibleOrders`, `fetchVisibleInvoices`, `fetchVisibleReturns`) accepts `{ column, direction }` and orders at PostgREST level. `item_count` on `/orders` post-sorts client-side because PostgREST can't order by an aggregate over an embedded table.
- Each list keeps `limit(200)` regardless of sort — pagination is a separate Phase 7 entry.

## Role dashboards (Phase 7a)

`/dashboard` picks one of five role components (admin → HQ → branch_manager → packer → branch_user). Each dashboard composes:

- A row of `<StatCard>`s in a `<StatCardGrid>` (1 col mobile / 2 col tablet / 4 col desktop).
- A `<RecentOrdersPanel>` showing the last 5 relevant orders.

DB queries live in `src/lib/db/dashboard.ts` and run under the user's session client so RLS handles branch + role scoping. Adding a new metric: drop a helper into that module, drop a `<StatCard>` into the role component.

## App shell layout (3.3.2)

`<AppShell>` (`src/components/app/app-shell.tsx`) is two regions:

- **Left rail (240 px sidebar):** navigation + user menu. Defined in `<AppSidebar>`. Items are role-aware (`viewsOrdersCrossBranch`, `isHqManager`, `isAdmin` from `src/lib/auth/roles.ts`).
- **Right column:** a 48 px **top bar** (`<header aria-label="Workspace top bar">`) followed by the page content.

The top bar is the slot for **global controls** — anything that should be reachable on every page regardless of which Server Component owns the body. Today it hosts the `<NotificationsBell>`. Future occupants land here:

- ⌘K command-palette trigger (Phase 7).
- Workspace switcher when multi-HQ ships (out of scope per SPEC §14).
- Global search.

**Page-level actions** (e.g. "View cart", "New product") live in each page's `<PageHeader actions={…}>`, NOT the top bar — they're contextual to a route, not global. Same `px-gutter` width on both so they line up vertically.

### Notifications bell (3.3.2)

`<NotificationsBell>` is a Server Component thin wrapper around the client component:

- Server fetch (`fetchMyNotifications` in `src/lib/db/notifications.ts`) seeds `{ unread_count, recent[] }` on first paint — no flash of empty state.
- Client component (`notifications-bell.client.tsx`) renders the badge + dropdown and polls `/api/notifications/me` every 30 s, paused when the tab is hidden, force-refreshed on focus.
- Mark-as-read goes through Server Actions (`src/lib/actions/notifications.ts`); RLS gates updates to the caller's own rows. No `audit_log` per mark — high-volume read-state mutation; the underlying entity changes are already audited.
- Pure consumer of 3.3.1's `notifications` rows. Headline copy lives in `src/lib/notifications/headline.ts` (pure module — pinned by 8 vitest cases). When 3.3.1 / 3.3.3 add new trigger types, add a `case` to `describeNotification` and a render function in `src/lib/email/templates/index.ts` — they're peers.

### Notification preferences + unsubscribe (3.3.3a)

Per-user opt-in/out for email + in-app notifications, plus an HMAC-signed unsubscribe link in every email.

- **Storage:** `users.notification_preferences` is a single JSONB column. Shape: `{ state_changes: { email, in_app }, admin_alerts: { email, in_app } }`. Migration `20260419000001` adds the column with an everything-on default (opt-out model).
- **Taxonomy:** `src/lib/email/categories.ts` is the single source of truth. Closed union `NotificationTriggerType` × `TRIGGER_CATEGORY` map × `FORCED_EMAIL_TRIGGERS` whitelist. `notify()`'s `type` parameter is narrowed to this union so a new trigger without a registered category fails to typecheck.
- **Filter:** `notify()` bulk-reads prefs for every recipient, inserts `notifications` rows only for in_app-on recipients, and sends email for email-on OR forced triggers. On a pref-read hiccup it falls back to the permissive default — over-notify beats silent compliance drops.
- **Forced override:** `FORCED_EMAIL_TRIGGERS` (currently `["order_submitted_while_overdue"]`) bypasses the email preference only — in-app stays toggleable. Email is the durable compliance record, the bell is ephemeral. Expanding the list is a one-way ratchet; the bar is financial/compliance impact, not operational inconvenience.
- **Unsubscribe link:** `src/lib/email/unsubscribe-token.ts` signs `(user_id, category, issued_at)` with `UNSUBSCRIBE_TOKEN_SECRET` (HMAC-SHA256). 60-day validity, 5-min future skew. Not single-use; `/unsubscribe`'s server action is idempotent.
- **Unsubscribe page:** `src/app/unsubscribe/{page.tsx,success/page.tsx,actions.ts}` — public (no session), token verifies authority. Any failure funnels to one "expired or invalid" UX. The server action flips the email bit via the service-role admin client + writes an `audit_log` row.
- **Settings page:** `src/app/(app)/settings/notifications/page.tsx` renders the 2×2 grid (categories × channels). Forced email cells render disabled + a static `FORCED_DISCLOSURE_TEXT` note; server-side preservation in `savePreferences` guards against a crafted POST flipping a forced bit.
- **Audit log:** Both the unsubscribe flow and the settings page write one `audit_log` row per changed save with `action='notification_preferences_updated'`, full `before_json` / `after_json` preferences, and a `source` discriminator (`'email_link'` vs `'settings_page'`). Idempotent: skipped when nothing changed.
- **Email footer:** `src/lib/email/templates/_layout.ts` `htmlLayout` + `textFooter` inject per-recipient unsubscribe + prefs links using `{{UNSUBSCRIBE_URL}}` and `{{PREFS_URL}}` placeholders. `notify()` substitutes them at send time so templates stay pure (one render per trigger).
- **Company identity:** `src/config/company.ts` is the single import site for legal name, KvK, addresses, support email, website. `[PLACEHOLDER]` values are listed in `docs/CHANGELOG.md` under "pre-production fill-ins".

### Online payments + RMA (Phase 6)

**Mollie (mock)** — adapter-pattern payment gateway.

- `src/lib/payments/transport.ts` defines `PaymentTransport` + a `mockTransport()` that issues `tr_mock_*` ids and returns a local `/mollie-mock/checkout?...` URL. Cutover to real Mollie is a one-file swap (+ env var + webhook-signature verification, both tagged as Phase-6 PAUSE triggers).
- `src/lib/actions/mollie-payments.ts` (`payInvoiceWithMollie`) validates + stamps `invoices.mollie_payment_id` + redirects to the checkout URL.
- `/api/webhooks/mollie` (POST) flips `issued/overdue → paid` under a status guard, records a `payments` row with `method='ideal_mollie'`, and audits both the webhook receipt and the state flip. Accepts JSON (mock) and form-urlencoded (real Mollie shape) — live Mollie adds signature verification in the follow-up PR.
- `/mollie-mock/checkout` is a dev-only page with two buttons that POST to the real webhook.

**RMA state machine** — `requested → approved|rejected`, `approved → received`, `received → closed`.

- `src/lib/actions/returns.ts` — `createReturn` / `approveReturn` / `rejectReturn` / `receiveReturn` / `closeReturn`. All status-guarded; all write an `audit_log` row; all emit a notification.
- `receiveReturn` writes per-item `return_in` inventory movements when admin flags restock, and auto-creates a replacement order at `status='approved'` for `replace` resolutions (SPEC §8.7 step 3).
- Money resolutions (`refund`, `credit_note`) are persisted at receive time but NOT executed — UI disables the dropdown options with a "Phase 6 follow-up" label.
- Pages: `/returns` list + `/returns/new?order_id=…` + `/returns/[id]`. Order detail grows an "Open a return" button on `delivered / closed` orders.
- `ReturnStatusPill` component follows the Order + Invoice pill shape.

### Invoicing (Phase 5)

End-to-end admin-driven invoice lifecycle. Schema already existed from Phase 1.5; Phase 5 fills in actions, PDFs, pages, cron.

- **Lifecycle:** `draft → issued → paid` (admin manual) + `issued → overdue` (cron) + `* → cancelled` (admin).
- **`src/lib/actions/invoices.ts`** — `createDraftInvoiceFromOrder / issueInvoice / markInvoicePaid / cancelInvoice`. All admin-only (RLS enforces at Postgres; role check gives friendly errors). Status-guarded UPDATEs for every transition. `createDraftInvoiceFromOrder` redirects to `/invoices/[id]` on success via Next's `redirect()` (same pattern as editOrder / saved-order-edit flow).
- **PDF** (`src/lib/pdf/invoice.tsx` + `/api/pdf/invoice/[invoiceId]`) — A4 portrait, light-mode only, Node runtime. Pulls company identity from `src/config/company.ts`; `[PLACEHOLDER]` values are hidden rather than leaked onto paper.
- **Pages** — `/invoices` list with filter chips, `/invoices/[id]` detail with admin action bar + payments ledger + activity timeline. Order detail page grows a new "Invoice" section on fulfilled orders (create button for admins, link for everyone else).
- **Cron** (`/api/cron/overdue-invoices`) — runs `0 1 * * *` UTC (02:00 Europe/Amsterdam winter). Two passes: flip newly-overdue invoices, then send reminder emails at 7 / 14 / 30 days overdue. Reminder dedupe is audit-log driven — re-running the cron same day is a no-op.
- **Notifications** — new triggers `invoice_issued` + `invoice_overdue_reminder` registered in `src/lib/email/categories.ts` (state_changes, not forced). Recipients = branch managers of the invoice's branch.
- **Order↔invoice link** — `invoices.order_id` FK is `on delete set null`; manual 1:1 enforcement at the action layer for v1. Schema doesn't preclude split-invoicing in a future phase.

### Order edit (Phase 3.4)

A `submitted` order can be edited until the BM moves it to `branch_approved`. After that the order is frozen for the rest of its lifecycle.

- **`/orders/[id]/edit`** — Server Component checks status + role gate (creator / BM-of-branch / admin/super; HQ explicitly excluded), hydrates `<EditForm>` with current lines + product min/max bounds.
- **`editOrder`** server action (`src/lib/actions/order-edit.ts`) — diffs desired vs current `order_items`, applies inserts / updates / deletes, recomputes totals via `recomputeOrderTotals`, stamps `edit_count++ / last_edited_at / last_edited_by_user_id`, resets `submitted_at` so the §8.8 step-1 auto-cancel timer restarts. Append-only `order_edit_history` row with full before/after JSON snapshots; `audit_log` row with line + total deltas.
- **Concurrency** — header UPDATE is double-guarded on `status='submitted'` AND `edit_count = expected`, so two edits can't race past each other. The BM approve form (`branchApproveOrder`) carries `last_edited_at_expected` and refuses with a friendly "refresh" error if the order was edited mid-review (SPEC §8.9 + journal risk #4).
- **`<OrderEditHistory>`** (`src/components/app/order-edit-history.tsx`) — collapsible diff viewer below the activity timeline; aligns Before/After by `product_id`. Row-level rendering shows removed / added / changed lines via `data-diff-kind` attributes.
- **Notification** — new trigger `order_edited` in `categories.ts` (state_changes, not forced); `renderOrderEdited` template; `describeNotification` headline; `ActivityTimeline.describeAction` learned the action label + payload summary.

### Picking & packing (Phase 4)

Packer-first two-route workflow:

- **`/pack`** — queue of `approved` + `picking` orders, FIFO by `approved_at`. Admins see cross-branch; packers see the same list (RLS already narrows to fulfilment-stage rows).
- **`/pack/[orderId]`** — workspace with a 64 px auto-focused scan input, line list sorted by `inventory.warehouse_location`, pallet side panel with "New pallet" / "Close pallet" / "Label PDF" affordances, and a "Complete pack" button gated by (all lines fully packed ∧ no pallet still open).

Server actions live in `src/lib/actions/packing.ts`. Scan looks up `product_barcodes.barcode` → `product_id`, finds an under-packed line, and bumps `order_items.quantity_packed` by `unit_multiplier`. First pack action on an `approved` order status-flips it to `picking`; `completeOrderPack` flips `picking → packed` with a full inventory accounting pass (`inventory_movements` with reason `packed`, per-line decrement of both `quantity_on_hand` and `quantity_reserved`). Every mutation writes an `audit_log` row (`pack_increment`, `pack_overpack`, `pallet_closed`, `order_packed`).

Pallet numbering goes through `allocate_sequence('pallet_<year>')` (foundation migration 4's `SECURITY DEFINER` allocator) with format `PAL-YYYY-NNNNN` per SPEC §6.

PDFs render server-side via `@react-pdf/renderer` at `/api/pdf/pick-list/[orderId]` and `/api/pdf/pallet-label/[palletId]`. Both are `runtime: "nodejs"` (react-pdf needs fs-style APIs that aren't in the Edge runtime) and role-gated to packer / administration / super_admin. The pallet label embeds a QR of the pallet UUID so a future branch-receiving scan (Phase 4.2) lands on a unique row.

## Testing
- **Vitest** — unit tests (`tests/lib/…`) and an RLS harness (`tests/rls/…`) that proves cross-branch reads are denied.
- **Playwright** — happy-path e2e (`tests-e2e/`) at 1440 / 768 / 375 viewports. `webServer` config auto-starts the dev server.
