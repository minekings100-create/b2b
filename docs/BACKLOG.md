# Backlog

Feature notes and future refinements we want to remember but haven't built yet. Organised by the SPEC §11 phase in which they'll land, so each entry sits near the code that will implement it. Add to this file whenever an idea comes up mid-phase that shouldn't derail the current sub-phase.

Each entry follows the shape:

- **One-line title**
- _Captured: YYYY-MM-DD_
- What it is, why it matters, and any design pointers.

---

## Phase 2 — Catalog & inventory

_(none yet)_

## Proposed Phase 2.6 — Inbound goods & replenishment

_Captured: 2026-04-17. Renumbered 2026-04-18 — the proposal was originally labelled "Phase 2.5" but that slot is now taken by the accepted Category CRUD phase. Status: **proposed, not yet accepted**. Slots after Phase 2.5 (category CRUD) and before Phase 3 (Ordering & approval) in SPEC §11 once approved. SPEC §11 stays untouched until then._

Two connected features covering stock coming **into** HQ — complementing the existing HQ → branch outbound flow.

### A. Goods receiving (goederenontvangst)

When a delivery arrives at HQ, admin scans inbound products.

- Barcode scan → match existing SKU → enter quantity received.
- Quantity adds to `inventory.quantity_on_hand`.
- Writes a new `inventory_movements` row with `reason='inbound_receipt'` (new enum member).
- Links to a `purchase_orders` row (if one exists) for reconciliation. Also standalone / unplanned receipts.
- UI: `/admin/receiving` — scan workflow echoing the packer view (SPEC §8.3) so muscle memory transfers.
- Partial receipts must work: PO for 100 units, 60 received now, 40 later, status `partially_received` until full.

### B. Purchasing / replenishment

New entities:

- `suppliers` — `name`, `contact`, `payment_term_days`, `default_vat_rate`.
- `purchase_orders` — `po_number`, `supplier_id`, `status` enum (`draft`, `sent`, `partially_received`, `received`, `closed`), dates, totals.
- `purchase_order_items` — line items with snapshot pricing + VAT.
- `goods_receipts` — one per receiving event; links to a PO when applicable.
- `goods_receipt_items` — which PO lines / quantities were received in this event.

Admin dashboard:

- **"Recommended to reorder"** — products where `available <= reorder_level`, sorted by urgency (how far under, how fast consumed recently). Suggested quantity from recent consumption history.
- Admin converts recommendations into a PO (draft).
- PO workflow: `draft → sent → partially_received → received → closed`.
- No supplier API — PO is a PDF emailed out; receipts are manual scans via workflow A.
- **Role scope change:** `administration` gains purchasing rights (can create + send POs, mark receipts).

### Relationship to existing flow

HQ inventory now has two sources:

1. Branch returns (existing, SPEC §8.7 — reason `return_in`).
2. Supplier receipts (new, reason `inbound_receipt`).

Manual `adjustment_in` / `adjustment_out` stay for corrections, but regular stock increases should flow through `goods_receipts` for a proper audit trail tying stock to a supplier.

### Explicitly NOT in scope for proposed 2.5

- Multi-supplier per product (pick cheapest).
- Supplier catalog import / pricing tiers.
- Automated reorder-point calculation — the manual `inventory.reorder_level` stays the source of truth.
- Accounting integration for supplier invoices (out to Moneybird / Exact).

### Rough sizing

Similar shape to Phase 1.5 (schema-heavy scaffolding) plus a feature PR on top. Likely **2 PRs**:

1. Schema: `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, extend `inventory_movement_reason` enum. RLS per SPEC §5 + admin purchasing rights.
2. Feature: receiving scan UI at `/admin/receiving`, reorder-recommendations dashboard, PO CRUD + PDF, wiring into `inventory_movements`.

## Phase 3 — Ordering & approval

_(none yet)_

## Phase 4 — Picking & packing

### Inline item detail panel on the pick list
_Captured: 2026-04-17._

When a packer taps/clicks an item on the pack queue or pick list, expand an inline detail panel **in place** (no modal, no route change) showing:

- **Barcode**, rendered both scannable and as text.
- **Warehouse location** prominently (e.g. "Row B – Shelf 9").
- **Optional product thumbnail** for visual confirmation.

**Why:** packers need to know where to walk physically, and a visible barcode reduces mis-scans. Getting this wrong slows the whole pick.

**Design pointers:**
- Expand-in-place, not a drawer or a route. Fast 120–180ms transition per SPEC §4.
- Only one row expanded at a time; tapping another collapses the first.
- Reuse existing tokens: `rounded-lg`, `ring-1 ring-border`, no drop shadow on static surfaces.
- This note is also mirrored in SPEC §8.3 so the pick-list implementer catches it there.

## Phase 5 — Invoicing

_(none yet)_

## Phase 6 — Online payment & RMA

_(none yet)_

## Phase 7 — Polish

### DST-aware cron scheduling
_Captured: 2026-04-18 (from 3.2.2 plan)._

Vercel Cron uses UTC, so a schedule pinned to "08:00 Europe/Amsterdam" drifts ±1h across DST boundaries. The auto-cancel cron (3.2.2c, `0 6 * * *` UTC = 08:00 winter / 09:00 CEST) and the awaiting-approval reminder cron (3.3.1, `15 0 * * *` UTC = 02:15 winter / 03:15 CEST) both have this. Acceptable for once-a-day jobs; revisit when a customer cares about exact wall-clock timing.

**Options when picked up:** (a) split each cron into two schedules (one CET, one CEST) with an in-handler timezone gate, (b) move to a cron service with TZ-aware schedules (e.g. an external scheduler hitting our HTTP endpoints), or (c) move to Postgres `pg_cron` with `timezone('Europe/Amsterdam', now())` checks inside the handler.

### Public holidays (NL) for working-days helper
_Captured: 2026-04-18 (from 3.2.2 plan)._

`src/lib/dates/working-days.ts` (3.2.2c) ships with a `holidays?: Date[]` option already plumbed through but no holiday data wired in. Phase 7 adds: (a) a small admin UI to manage NL public holidays (or import a static list — Koningsdag, Bevrijdingsdag, the standard set), (b) a server helper that loads the active list and passes it to every `addWorkingDays` / `isWorkingDay` call site (auto-cancel cron, invoice `due_at`).

### 90-day notifications cleanup cron
_Captured: 2026-04-19 (from the orphaned-notification follow-up to 3.3.2)._

3.3.2 hides orphaned notifications (target order deleted) at the data layer + has a defensive click-time recheck. Both work, but old notifications still accumulate forever — over months / years that's a slow-growing dead-row problem on the `notifications` table.

**Behaviour when picked up:**
- New cron route `/api/cron/cleanup-notifications` (or fold into the existing `/api/cron/auto-cancel-stale-orders` if both run on the same daily tick).
- `DELETE FROM notifications WHERE sent_at < now() - interval '90 days' AND read_at IS NOT NULL` — only delete read rows past 90 days, leave unread alone forever (the user hasn't seen them yet).
- Schedule: weekly (`0 6 * * 0` UTC = Sunday 08:00 winter) — daily is overkill for housekeeping.
- `CRON_SECRET` Bearer guard, same as the other cron routes.
- 90 days mirrors GDPR-friendly retention defaults; revisit alongside the broader Phase 7 retention policy.
- Audit-log: skip — high-volume housekeeping; emit a single summary row per run if useful (`action='notifications_cleanup'`, `after_json={ deleted: N }`).

### Sortable column headers on order tables
_Captured: 2026-04-19._

`/orders` and `/approvals` tables have static column headers — no way to re-sort by total / branch / lines / status / approval timestamp. Users currently rely on the default `submitted_at desc` sort.

**Behaviour when picked up:**
- Click a sortable header → sort `asc`. Click again → `desc`. Third click → reset to default (`submitted_at desc`).
- Visible sort indicator next to the header (arrow up / down / double).
- Persist the sort in the URL as `?sort=<col>&dir=asc|desc` so the back button + bookmarks work.
- Columns to support: `number`, `submitted_at`, `branch`, `total_gross_cents`, `item_count`, `status`, `approved_at`, `branch_approved_at`. Default fallback (no `sort` param) stays `submitted_at desc`.
- Server Component path: parse the param with Zod at the trust boundary (same pattern as the `?status=` filter chips), pass into `fetchVisibleOrders` / `fetchApprovalQueue`.
- Each list query keeps its hard `limit(200)` regardless of sort — pagination is a separate Phase 7 entry.

## Cross-cutting

### Archive / Restore UX pattern
_Captured: 2026-04-18._

Every entity that supports soft-delete today (`deleted_at` + `active=false`) is already reversible at the data level, but no screen exposes the restore path. This gap is **cross-cutting** — the same pattern should apply to every archivable entity.

**Affects:** products, categories, branches, users — and suppliers once the proposed Phase 2.6 lands.

**Pattern:**
- Each list view gains a **"Show archived"** filter toggle (default off).
- Archived rows render at **reduced opacity** and carry an **"Archived"** badge.
- Each archived row has a **"Restore"** action (admin-only).
- Restore clears `deleted_at`, sets `active = true`, writes an `audit_log` row with `action='restore'` (new action name; the tables already accept arbitrary action strings).
- **Hard delete** remains a separate, rarely-used admin action for genuinely unwanted data (consent: type-to-confirm modal or similar).

**Scope decision (deferred):** implement as a small dedicated phase between Phase 6 and Phase 7, or absorb into Phase 7 polish. Pick when we get there.

**Design pointers:**
- Keep the list toggle URL-driven (`?archived=1`) so the state survives refresh and is shareable.
- Reuse existing tokens; the "Archived" badge should use `Badge variant="neutral" dot={false}` with 60–70% opacity on the row.
- Per-entity Server Actions already return `{ success: true }` patterns that the restore actions can mirror.
- Server Actions should re-check `isAdmin` plus the existing RLS policies; category and product RLS covers this already, branches/users need a review once implemented.
