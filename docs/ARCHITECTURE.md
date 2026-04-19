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
