# Internal Procurement Platform — Build Specification

## 1. Project Context

Build an **internal B2B procurement platform** for a multi-branch Dutch company. Branches order operational materials (cleaning supplies, POS/kassa materials, displays, refrigerators, consumables) from the central HQ warehouse. The system handles the full lifecycle: **catalog → ordering → approval → picking & packing → shipping → invoicing → payment → returns.**

- All user-facing UI in **English**.
- ~500 SKUs at launch.
- Deployed at a single `.com` domain, accessible only to authenticated users.
- Multi-tenant by **branch**, not by organisation — one HQ, many branches.

## 2. Tech Stack (fixed)

- **Next.js 14** (App Router, Server Components by default, Server Actions for mutations, Route Handlers for webhooks)
- **TypeScript**, strict mode
- **Tailwind CSS** + **shadcn/ui** components
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Resend** for transactional email (keep adapter pattern so SendGrid is a drop-in replacement)
- **Mollie** for iDEAL payments (webhook-driven)
- **React Hook Form** + **Zod** for form validation
- **@tanstack/react-query** for client-side data fetching where SSR is not sensible
- **react-pdf** (or Puppeteer on a Vercel function) for PDF invoices & pallet labels
- **next/font** for `Inter` and `Geist Mono`
- **Vitest** for unit tests, **Playwright** for critical e2e flows
- Deployed on **Vercel**; Supabase project in EU region

## 3. Non-Functional Requirements

- **Role-based access** enforced both in app and at Postgres level with strict **Row Level Security**. App-level checks are never the only line of defence.
- **Audit log** on every status change across every critical entity (orders, invoices, inventory, returns, users).
- **Mobile/tablet-optimised** for packer and branch-receiving views; desktop-first for admin.
- Monetary amounts stored as **integer cents** (never float).
- Timestamps stored as `timestamptz` in UTC, rendered in `Europe/Amsterdam`.
- **Dutch VAT** handling: default 21%, support 9% and 0% per product.
- **GDPR**: soft deletes via `deleted_at`, per-user data export endpoint, privacy policy page, cookie notice.
- **Accessibility** WCAG 2.1 AA baseline. Keyboard-navigable; focus states always visible.
- **Error handling**: every mutation wrapped in try/catch → toast + structured server log, never raw stack traces to user.
- i18n-ready structure (next-intl) even though only English is shipped, so future Dutch/FR/DE is trivial.

## 4. Design & UX Direction

**Inspiration:** Vercel dashboard, Stripe dashboard, Linear. Monochrome-first, data-forward, compact, fast, professional. No illustrations, no gradients, no decorative elements. The UI should feel like a tool a senior operator uses daily — not a marketing site.

### Principles

1. **Typography does the work.** Hierarchy through weight and size, not borders or colour.
2. **Monochrome base, one accent.** 95% neutrals. Accent is reserved for primary actions, active states, focus rings, and selection — never decoration.
3. **Borders subtle or absent.** Prefer background-shade differences over 1px borders; when used, 1px with `zinc-200` / `zinc-800`.
4. **Density over whitespace.** Tables are compact: 40px row height, 13px body text. Dashboards fit more info per screen than they "breathe".
5. **Status colour has meaning, not decoration.** Success = emerald, warning = amber, error = red, info = accent. Used on small dots/badges, rarely as fills.
6. **Numbers are monospaced.** Tabular figures (`font-variant-numeric: tabular-nums`) on every `<td>` holding a number. Invoice, order, pallet, SKU numbers all in mono.
7. **Micro-interactions are fast and quiet.** 120–180ms ease-out. No spring physics. No page-level transitions.
8. **Keyboard-first.** `⌘K` command palette on every screen. `j/k` to navigate tables. `g o` → Orders, `g i` → Invoices, `g p` → Pack queue. Hints visible in menus.
9. **Loading states = skeleton rows, not spinners.** Never blank screens. Spinners only inside buttons during submit.
10. **No modal-inside-modal. No toast longer than 5 seconds. No emoji in UI copy.**

### Design Tokens

**Fonts**
- Sans: `Inter` via `next/font`, with `font-feature-settings: 'cv11','ss01','ss03'` for Linear-esque clarity
- Mono: `Geist Mono` for numbers, SKUs, invoice/pallet numbers, keyboard hints

**Type scale**
- `text-xs` 11px — meta, badges, kbd hints
- `text-sm` 13px — body default in dense views
- `text-base` 14px — body default elsewhere
- `text-lg` 16px — section headers
- `text-xl` 20px — page headers
- `text-2xl` 24px — primary page titles (used sparingly)
- Line-height tight: 1.35 body, 1.2 headers

**Colour — neutrals** (Tailwind `zinc`, both modes)
- Light: bg `zinc-50`, surface `white`, border `zinc-200`, text `zinc-900` / muted `zinc-600` / disabled `zinc-400`
- Dark: bg `zinc-950`, surface `zinc-900`, border `zinc-800`, text `zinc-50` / muted `zinc-300` / disabled `zinc-500`

**Colour — accent: Indigo**
- Light: `indigo-600`, hover `indigo-700`, subtle bg `indigo-50`
- Dark: `indigo-500`, hover `indigo-400`, subtle bg `indigo-950`
- Exposed as a single CSS custom property `--accent` so it can be swapped without touching components

**Colour — status** (light / dark)
- Success `emerald-600` / `emerald-500`
- Warning `amber-600` / `amber-500`
- Error `red-600` / `red-500`
- Info uses accent

**Spacing**
- Base unit 4px; use Tailwind scale
- Page gutter 24px, section gap 24–32px, card padding 16px
- Table cell padding `px-3 py-2.5`

**Radius**
- 6px (`rounded-md`) — buttons, inputs, badges
- 8px (`rounded-lg`) — cards, panels
- `rounded-full` only for avatars and status dots

**Elevation**
- Light: no drop shadows on static cards; use `ring-1 ring-zinc-200`
- Dark: no shadows, use `ring-1 ring-zinc-800`
- Modals/dropdowns/popovers: `shadow-lg shadow-black/5` (light) / subtle ring only (dark)

**Focus**
- Always visible: `ring-2 ring-indigo-500 ring-offset-0`

### Theming

- **Light and dark both shipped.** Default: system preference. User can override via setting in profile; stored in `users.ui_theme` (`system | light | dark`).
- Implemented via `class` strategy on `<html>` with Tailwind, CSS variables for accent and neutrals.

### Component Notes

- **Buttons**: three variants. `primary` = accent bg, `secondary` = neutral surface with ring, `ghost` = text only with hover bg. Heights: 32px default, 28px for table row actions, 48px for packer view.
- **Inputs**: single-line, 32–36px height, subtle border, accent focus ring. Label above input in `text-xs uppercase tracking-wide text-zinc-500` (Linear-style). No floating labels.
- **Tables**: zebra OFF. Row hover `zinc-50` / `zinc-900/50`. Sticky header. Sort indicator inline next to column name. Row action buttons appear on row hover.
- **Status badges**: small pill with `•` dot + label, tinted bg + coloured text (e.g. `bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400`).
- **Navigation**: left sidebar, 240px, collapsible to 56px (icons only). Section labels `text-xs uppercase tracking-wide text-zinc-500`. Active item: accent left-border (2px) + accent text.
- **Command palette** (`⌘K`): universal search + navigation + actions. Scoped to user permissions. Built with `cmdk`.
- **Page layout**: sidebar + main. Main has a breadcrumb + page-title row at top, then content. Right drawer (not modal) for detail views where possible.
- **Forms**: single column, labels above. Submit buttons pinned to a bottom bar in long forms.

### Role-specific deviations

- **Packer view** (`/pack`): density DOWN, touch-targets UP. Buttons 48px, body text 16px, generous padding. Same tokens, different ergonomics — warehouse tablet usage wins over info density. Scan input box is 64px tall and permanently auto-focused.
- **PDF invoices / pallet labels / packing slips**: same type + colour system, but fixed light-mode, print-safe. Masthead with HQ name/logo, structured header block (invoice #, dates, addresses), clear table, totals block. No decorative elements.

### What we explicitly DON'T build

- Gradients anywhere
- Illustrations or decorative imagery
- Rounded-full cards, oversized hero sections, splash screens
- Emoji in UI copy
- Coloured section backgrounds
- Page transitions, parallax, or scroll-triggered animations
- Toast notifications that linger beyond 5 seconds
- Modal-inside-modal flows

## 5. Roles & Permission Matrix

| Role              | Catalog | Order                   | Approve | Pack    | Invoices           | Admin                      |
|-------------------|---------|-------------------------|---------|---------|--------------------|----------------------------|
| **Branch User**   | Read    | Create (own branch)     | —       | —       | Read (own branch)  | —                          |
| **Branch Manager**| Read    | Create + read branch    | Own branch | —    | Read (own branch)  | Manage users in own branch |
| **Packer**        | Read    | Read (assigned)         | —       | Full    | —                  | —                          |
| **Administration**| Read    | Read (all)              | —       | —       | Full               | Manage products, reports   |
| **Super Admin**   | Full    | Full                    | Full    | Full    | Full               | Everything incl. settings  |

A user can hold multiple role+branch combinations (e.g. manager at branch A, user at branch B). Super Admin and Administration roles are branch-independent.

## 6. Data Model (Postgres)

All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`, `deleted_at timestamptz` (soft delete) unless noted.

### Identity & tenancy
- **users** — mirrors `auth.users`; `email`, `full_name`, `phone`, `active`, `ui_theme` (`system`/`light`/`dark`, default `system`)
- **branches** — `name`, `branch_code` (unique, human), `email`, `phone`, `visiting_address`, `billing_address`, `shipping_address`, `kvk_number`, `vat_number`, `iban`, `monthly_budget_cents` (nullable), `payment_term_days` (default 14), `active`
- **user_branch_roles** — `user_id`, `branch_id` (nullable for admin/super), `role` enum. Unique on triple.

### Catalog & inventory
- **product_categories** — `name`, `parent_id` (nullable, nesting), `sort_order`
- **products** — `sku` (unique), `name`, `description`, `category_id`, `unit` (e.g. `piece`, `box`, `liter`), `unit_price_cents`, `vat_rate` (21/9/0), `min_order_qty`, `max_order_qty` (nullable), `image_path` (Supabase Storage), `active`
- **product_barcodes** — `product_id`, `barcode`, `unit_multiplier` (default 1 — a box-barcode can equal 12 units)
- **inventory** — one row per product: `quantity_on_hand`, `quantity_reserved`, `reorder_level`, `warehouse_location` (bin/shelf free-text)
- **inventory_movements** — append-only: `product_id`, `delta`, `reason` enum (`order_reserved`, `order_released`, `packed`, `adjustment_in`, `adjustment_out`, `return_in`), `reference_type`, `reference_id`, `actor_user_id`

### Orders
- **orders** — `order_number` (e.g. `ORD-2026-0001`, yearly sequence), `branch_id`, `created_by_user_id`, `status` enum (`draft`, `submitted`, `approved`, `rejected`, `picking`, `packed`, `shipped`, `delivered`, `closed`, `cancelled`), `submitted_at`, `approved_at`, `approved_by_user_id`, `rejection_reason`, `total_net_cents`, `total_vat_cents`, `total_gross_cents`, `notes`
- **order_items** — `order_id`, `product_id`, `quantity_requested`, `quantity_approved`, `quantity_packed`, `quantity_shipped`, `unit_price_cents_snapshot`, `vat_rate_snapshot`, `line_net_cents`

### Fulfillment
- **pallets** — `pallet_number` (e.g. `PAL-2026-00042`, yearly sequence), `order_id`, `packed_by_user_id`, `packed_at`, `status` enum (`open`, `packed`, `shipped`, `delivered`), `weight_kg` (nullable), `notes`
- **pallet_items** — `pallet_id`, `order_item_id`, `quantity`
- **shipments** — `order_id`, `carrier`, `tracking_number`, `shipped_at`, `delivered_at`
- **shipment_pallets** — many-to-many `shipment_id`, `pallet_id`

### Billing
- **invoices** — `invoice_number` (e.g. `INV-2026-00001`, gap-less yearly sequence), `order_id`, `branch_id`, `issued_at`, `due_at`, `total_net_cents`, `total_vat_cents`, `total_gross_cents`, `status` enum (`draft`, `issued`, `paid`, `overdue`, `cancelled`), `paid_at`, `payment_method` enum (`manual_bank_transfer`, `ideal_mollie`, `credit_note`, `other`), `mollie_payment_id`, `pdf_path`
- **invoice_items** — snapshot: `invoice_id`, `description`, `quantity`, `unit_price_cents`, `vat_rate`, `line_net_cents`, `line_vat_cents`
- **payments** — `invoice_id`, `amount_cents`, `paid_at`, `method`, `reference`, `recorded_by_user_id`

### Returns (RMA)
- **returns** — `rma_number`, `order_id`, `branch_id`, `requested_by_user_id`, `status` enum (`requested`, `approved`, `rejected`, `received`, `processed`, `closed`), `reason`, `notes`, `requested_at`, `processed_at`
- **return_items** — `return_id`, `order_item_id`, `quantity`, `condition` enum (`damaged`, `wrong_item`, `surplus`, `other`), `resolution` enum (`refund`, `replace`, `credit_note`)

### Cross-cutting
- **audit_log** — `entity_type`, `entity_id`, `action`, `actor_user_id`, `before_json`, `after_json`
- **notifications** — `user_id`, `type`, `payload_json`, `sent_at`, `read_at`
- **numbering_sequences** — `key` (e.g. `invoice_2026`), `next_value` — used inside a transaction to safely allocate gap-less sequential numbers

## 7. Status Flows

**Order:** `draft → submitted → approved → picking → packed → shipped → delivered → closed`
Side paths: `submitted → rejected`; from any pre-shipped state → `cancelled`.

**Invoice:** `draft → issued → paid`; cron transitions `issued → overdue` when past `due_at`; admin can `→ cancelled`.

**Return:** `requested → approved → received → processed → closed`; `requested → rejected`.

## 8. Key Workflows

### 8.1 Order creation (Branch User / Manager)
1. Browse catalog: search by SKU/name, filter by category, toggle "in-stock only".
2. Add to cart (client state); cart persists as `draft` order on save.
3. Cart view enforces `min_order_qty` / `max_order_qty`. Branch users always see prices.
4. **Outstanding-invoice check on submit** — if the branch has any invoice with `status IN ('issued','overdue')` past `due_at`, show a blocking modal:
   - "Branch has N overdue invoice(s) totalling €X. Contact administration."
   - Options: `Cancel` (default) / `Submit anyway` (requires typing `CONFIRM`).
   - If submitted anyway: order proceeds, admin gets an immediate email, AND the admin dashboard shows a badge on that branch ("New order while overdue").
5. On submit: status `submitted`, email to branch managers.

### 8.2 Approval (Branch Manager)
1. Approval queue shows `submitted` orders for the manager's branch(es), oldest first.
2. Manager can adjust `quantity_approved` downward per line, then approve with optional note — OR reject with required reason.
3. On approve: status `approved`, inventory reservations created (`inventory_movements` with reason `order_reserved`), email to packer pool.
4. If any approved quantity exceeds `quantity_on_hand - quantity_reserved`, a hard warning appears; approval still allowed (becomes backorder) but flagged on the pick list.

### 8.3 Picking & Packing (Packer, tablet-first)
1. Packer sees queue of `approved` orders, priority = oldest `approved_at`.
2. Open order → pick list with bin locations, sorted by location for efficient walking.
3. Tapping/clicking an item **expands an inline detail panel in-place** (no modal, no navigation) showing the barcode rendered both scannable and as text, the warehouse location prominently (e.g. "Row B – Shelf 9"), and optionally a small product thumbnail. Fast transition; nearest-neighbour only — one expanded row at a time.
4. Scan input auto-focused; packer scans product barcode → matches open line, increments `quantity_packed` by `unit_multiplier`. Over-scan triggers confirm dialog.
5. Manual fallback: tap line, enter quantity.
6. Items are assigned to a **pallet** — either the currently open pallet for this order, or a new pallet (auto-numbered).
7. Closing a pallet sets its status to `packed` and generates a **pallet label PDF**: QR of pallet_number, human-readable pallet_number, order number, branch name, item count. Printable.
8. Order becomes `packed` when all approved-quantity items are accounted for across one or more pallets. Inventory moves from reserved → deducted from `quantity_on_hand`.

### 8.4 Shipping
1. Admin/super assigns pallets to a **shipment**, enters carrier + tracking. Status `shipped`.
2. **Packing slip PDF** generated per shipment (pallets, items, branch, destination).
3. On `shipped`, an invoice is auto-created as `draft` for admin review before issuing.

### 8.5 Branch receiving (optional but wired)
1. Branch user scans pallet QR on arrival → marks pallet `delivered`, enters any discrepancies.
2. When all pallets of an order are `delivered` → order status `delivered`.
3. After 14 days without disputes → order `closed`.

### 8.6 Invoicing & payment
1. Admin reviews draft invoice → `Issue` → PDF generated, emailed to branch billing contact, status `issued`.
2. Branch sees invoice in portal with two payment options:
   - **Pay online** (iDEAL via Mollie) → Mollie payment created → redirect → webhook confirms → status `paid`.
   - **Mark bank transfer pending** → admin confirms receipt manually.
3. Nightly cron @ 02:00 Europe/Amsterdam:
   - Move `issued` invoices past `due_at` → `overdue`.
   - Send reminder emails at +7, +14, +30 days past due.

### 8.7 Returns / RMA
1. Branch user creates a return against a `delivered` order: picks items + reason + condition.
2. Admin reviews → approves/rejects.
3. On physical receipt, admin marks `received` per item, picks resolution:
   - `refund` → credit note (negative invoice lines)
   - `replace` → creates a new linked order, skips approval
   - `credit_note` → credit balance applied to open invoices
4. Inventory movement `return_in` if the item is restockable.

## 9. Screens / Navigation

### Branch portal (`/branch/...`)
- **Dashboard**: recent orders, open invoices, overdue total, MTD spend, monthly budget progress
- **Catalog** — search + category tree + "order favourites"
- **Cart** → submit flow
- **Orders** list + detail with status timeline
- **Invoices** list + detail + pay online
- **Returns** list + create flow
- **Profile** — branch details (read-only for users, limited-edit for managers)

### Approval queue (`/approve`) — visible only when user has manager role

### Warehouse (`/pack`) — tablet-optimised
- Queue of approved orders
- Order detail / pick view with scan input
- Pallet manager (open/close, print label)
- "Completed today" summary (packer's own throughput)

### Admin (`/admin/...`)
- **Orders** — global, filterable, exportable
- **Invoices** — drafts / issued / overdue / paid
- **Inventory** — adjustments with reason, low-stock dashboard
- **Catalog** CRUD + CSV import/export
- **Branches** CRUD
- **Users & roles**
- **Reports** — spend per branch, top products, monthly turnover, AR aging, packer throughput
- **Settings** (super admin only) — VAT rates, invoice prefixes, payment terms defaults, email templates, Mollie key
- **Audit log** viewer with filters

## 10. Specific Features (recap)

- **Outstanding-invoice alert** — §8.1 step 4
- **Multi-pallet orders with auto-numbered labels** — §8.3
- **iDEAL via Mollie** — §8.6, webhook at `/api/webhooks/mollie`
- **Return / RMA** — §8.7
- **Scan + manual packing** — §8.3, using `product_barcodes` with unit multipliers

## 11. Build Phases (ship incrementally; each phase = one PR milestone)

### Phase 1 — Foundation
Next.js + Supabase scaffolding, auth (email/password + magic link), `users` / `branches` / `user_branch_roles` with RLS, seed data (5 branches, 20 users across roles, 500 mock products across 10 categories), base layout with sidebar + theming (light/dark, system default), empty dashboard shells for all roles, command palette skeleton.

### Phase 1.5 — Schema scaffolding (accepted scope adjustment, 2026-04-17)
**Schema-only** landing of every remaining §6 table so demo data can be seeded end-to-end for visual review before feature work begins. Adds: `product_barcodes`, `inventory`, `inventory_movements`, `orders`, `order_items`, `pallets`, `pallet_items`, `shipments`, `shipment_pallets`, `invoices`, `invoice_items`, `payments`, `returns`, `return_items`, `notifications`. Each table ships with the RLS policies required by §5 and `updated_at` / `audit_log` wiring where the §6 spec calls for it. **No Server Actions, no UI, no business logic.** Features still ship per Phases 2–6 below — each of those phases now starts from an existing schema rather than creating its own tables. A companion `npm run seed:demo` populates every table with representative data across all statuses for visual QA.

### Phase 2 — Catalog & inventory
`products`, `product_categories`, `product_barcodes`, `inventory`, `inventory_movements`. Admin catalog CRUD + CSV import. Branch catalog browse with search + category filter + in-stock toggle.

### Phase 3 — Ordering & approval
Cart, order submit, outstanding-invoice check, approval queue, status transitions, inventory reservations, Resend email hooks.

### Phase 4 — Picking & packing
Packer tablet UI, scan input, pallet creation, pallet-label PDF, pick-list PDF, packing-slip PDF.

### Phase 5 — Invoicing
Auto-draft invoice on ship, PDF generation, issue + send, admin invoice queue, manual mark-paid, nightly overdue cron + reminders.

### Phase 6 — Online payment & RMA
Mollie iDEAL integration + webhook, returns workflow, credit notes.

### Phase 7 — Polish
Reports, low-stock alerts, audit-log viewer, accessibility audit, full Playwright coverage of happy paths, English copy review, documentation in `/docs`.

## 12. Acceptance Criteria (per phase)

Each phase is complete only when:
- All new RLS policies verified with an automated test that attempts cross-branch access and must be denied.
- Happy-path e2e test green (Playwright).
- Every new mutation produces an `audit_log` entry.
- Responsive verified at 1440 / 1024 / 768 / 375 breakpoints.
- Light and dark both visually checked for every new screen.
- Error states have friendly empty states and toast notifications.
- No `any` types in new TS code; ESLint + typecheck passing.
- Short changelog appended to `/docs/CHANGELOG.md`.

## 13. Initial Instructions for Claude Code

1. Read this entire document before touching code. Ask clarifying questions only about genuine ambiguity; default to the spec.
2. Create a new Next.js 14 project with TypeScript, Tailwind, shadcn/ui, `next/font` (Inter + Geist Mono), `cmdk`, `next-themes`. Set up ESLint, Prettier, Vitest, Playwright.
3. Set up a Supabase local dev environment; all schema changes via versioned SQL migrations in `/supabase/migrations`.
4. Implement §4 (Design & UX Direction) as a base design system BEFORE building features — tokens in `tailwind.config.ts`, CSS variables for accent/neutrals, theme provider, base components (`Button`, `Input`, `Table`, `Badge`, `Sidebar`, `PageHeader`, `EmptyState`, `SkeletonRow`).
5. Then implement Phase 1 end-to-end, write tests, open a PR, wait for review before Phase 2.
6. Keep Server Actions for mutations; keep components as Server Components unless interactivity requires client.
7. Every new table gets RLS policies in the same migration that creates it — no exceptions.
8. Use `unknown` + Zod parsing at every trust boundary (form input, webhook payload, URL params).
9. Generated artefacts (PDFs) go to Supabase Storage under a structured prefix (`invoices/2026/INV-2026-00001.pdf`); signed URLs only.
10. No secrets in code; use Vercel + Supabase env vars. Document each env var in `/docs/ENV.md`.
11. After each phase, update `/docs/CHANGELOG.md` and a running `/docs/ARCHITECTURE.md`.

## 14. Out of Scope (for v1)

- Accounting software integration (Moneybird / Exact Online) — CSV export only for now
- Multi-warehouse / multi-HQ — single HQ assumed
- Multi-currency — EUR only
- Partial approvals split into multiple orders — not modelled; manager adjusts quantities within one order
- Automated carrier integration (PostNL / DHL APIs) — tracking number is stored manually, not fetched
- Supplier-side inbound purchasing — only HQ → branch flow

---

**End of specification.** Begin by implementing §4 as a design system, then Phase 1.
