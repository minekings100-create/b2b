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

### Sub-milestone 3.3.3b — polished email templates + /privacy + /cookies + full legal footer
_Captured: 2026-04-19. Deferred from the original 3.3.3 split (3.3.3a shipped the functional layer)._

3.3.3a left emails functional but visually plain: minimal HTML wrapper, single-line legal footer with `[PLACEHOLDER]` company fields, no `/privacy` or `/cookies` page wired. Real value of polish comes near demo / launch, not mid-MVP — defer until the catalogue → pack → invoice loop is closed and we're approaching first-customer onboarding.

**What ships when picked up:**
- **Branded email templates.** Logo, responsive table grid, consistent accent palette tied to design tokens (replace hard-coded `#4f46e5`), per-template hero, plaintext mirror that matches the HTML structure. Update `_layout.ts` + every render function in `templates/index.ts`.
- **Address block in the footer.** Once the `[PLACEHOLDER]` fields in `src/config/company.ts` (`kvk`, `btw_number`, `visiting_address`, `postal_address`, `phone`) have real values, render them in the footer block. The "pre-production fill-ins" CHANGELOG section already lists what's missing.
- **`/privacy` page.** GDPR boilerplate appropriate for an internal procurement tool with Supabase + Vercel as data processors. No 3rd-party trackers to disclose. Linked from the email footer + every authenticated page footer.
- **`/cookies` page.** Same treatment — internal session cookie only, no analytics, no marketing pixels. Linked from same places.
- **`testRenderAll()` snapshot fixture** so future template edits surface visual diffs in CI rather than only via manual smoke.

**Why deferred:**
- Functional emails already work end-to-end (3.3.3a). The polish is visual, not behavioural.
- Real legal copy (privacy / cookies) needs human review near launch, not now.
- Address block waits on the user supplying the real values — currently `[PLACEHOLDER]`.
- Template churn here would make the eventual visual-review PR noisier than necessary.

**Dependency:** none. Can ship any time after the company fill-in values are supplied.

## Phase 4 — Picking & packing

## Phase 4 — Picking & packing

### HQ approval: inline stock preview
_Captured: 2026-04-19._

When an HQ manager reviews a pending (branch-approved) order, show a subtle per-line inventory preview next to each line item:

> _on-hand: 42 → 30 after approval (12 reserved now)_

Small text, muted colour (`text-fg-subtle` / `text-xs`). Only rendered on the **HQ approver view** — the branch manager has already signed off on step 1 and cannot change quantities at step 2, so the preview would be noise there.

**Why phase 4 and not phase 7:** sits in the warehouse/inventory mental model phase 4 already occupies (pick lists, pallet labels, on-hand vs reserved). Phase 7 is polish on existing flows; this is a _new_ approval behaviour, not a cosmetic tweak.

**Implementation pointer:** uses existing columns `products.on_hand` + `products.reserved` already populated by the reservations flow (3.2). Pure read + render — no schema change, no action change. Compute `on_hand - reserved - pendingReserveForThisOrder` in the Server Component that renders the HQ review table.

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

### Bugfix: invoice "Cancel" button should not appear on drafts
_Captured: 2026-04-20._

A draft invoice corresponds to a fulfilled order — it must not be discardable. There is no scenario where deleting a draft is correct; doing so would leave a delivered order without an invoice trail. Drafts stay in the list indefinitely until the user clicks "Issue".

**Current bug:** clicking Cancel on a draft sets `status='cancelled'` permanently, mixing "don't send this yet" with "cancel an issued invoice."

**Fix scope:**
- Remove / hide the Cancel button when `invoice.status='draft'`.
- Keep Cancel available for `status='issued'` and later — legitimate use case with fiscal-trail requirements.
- No "Discard draft" action. Drafts are not discardable.
- No data migration; existing draft-cancelled rows can be reviewed manually or left as-is.

## Phase 6 — Online payment & RMA

_(none yet)_

## Phase 7 — Polish

### super_admin UI for `public_holidays` rows
_Captured: 2026-04-20 (Phase 7b-1 carry-over)._

7b-1 shipped the `public_holidays` table + 2026/2027 NL seed + the loader that wires it into `addWorkingDays`. Future-year seeding currently requires Studio access. 7b-2 adds a small admin-only page (super_admin role) to add / edit / delete rows, so the calendar can be maintained from inside the app.

**Behaviour when picked up:**
- New page under `/admin/holidays` (or similar) — super_admin gated.
- Table view of all rows for a region (default 'NL'), grouped by year.
- Add / edit / delete via Server Actions; one `audit_log` row per change (`entity_type='public_holiday'`, `action='public_holiday_added/updated/deleted'`).
- Optional convenience: "Seed NL year YYYY" button that bulk-inserts the 11 standard rows (with computed Easter-derived dates).

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

## Phase 8 — Communication (post-MVP)

### In-portal messaging between roles
_Captured: 2026-04-19._

**Goal.** Allow users inside the portal to have threaded conversations without leaving the app.

**Scope v1 (smallest useful):**
- 1-on-1 threads between specific role pairs (see matrix below).
- Thread attached to EITHER a specific order OR a branch — not free-floating DMs. Always has a context anchor.
- Text only, no attachments v1.
- Unread badge in the header bell or a separate chat icon.
- Realtime via Supabase Realtime (existing stack, no new infra).

**Permission matrix — who can start a thread with whom:**

|                  | Branch User | Branch Mgr | HQ Mgr | Packer | Admin | Super |
|------------------|:-----------:|:----------:|:------:|:------:|:-----:|:-----:|
| Branch User      | —           | ✓          | ✓      | ✗      | ✓     | ✓     |
| Branch Manager   | ✓           | —          | ✓      | ✗      | ✓     | ✓     |
| HQ Manager       | ✓           | ✓          | —      | ✓*     | ✓     | ✓     |
| Packer           | ✗           | ✗          | ✓*     | —      | ✓     | ✓     |
| Administration   | ✓           | ✓          | ✓      | ✓      | —     | ✓     |

\* Packer ↔ HQ Manager only allowed when anchored to a specific order the packer is assigned to. Prevents packers DMing HQ about unrelated matters.

**RLS requirements:**
- A user can read a thread only if they are a participant.
- Cross-branch reads blocked at the Postgres level (same RLS discipline as orders).
- Soft delete, no hard delete (GDPR + audit).

**Why not now:**
- Core MVP (packing, invoicing, payment) ships first.
- Email + in-app notifications already cover 80 % of routine communication.
- Scope: chat v1 is ~20–40 hrs of its own work.
- Real demand unvalidated — customers may just use existing tools (WhatsApp / Teams) in parallel to the portal.

**Revisit trigger:** after the first real customer uses the system in production for 4+ weeks, ask whether they wished they could message inside the portal. If yes, build. If they shrug, this stays on the backlog.

## Post-MVP (queued 2026-04-20, after Phase 7b-2d)

These items were either explicit scope cuts during MVP build-out or surfaced during the Phase 7 polish pass.

### User + branch full lifecycle (create + edit + role assignment)
_Captured: 2026-04-20 (Phase 7b-2b carry-over)._

Phase 7b-2b shipped `/users` and `/branches` as read-only lists with archive/restore. Create + edit + role assignment was deferred because it wraps Supabase Auth admin API (auth.users provisioning, email verification, password resets) — a different integration shape from table CRUD. Minimum viable lifecycle:

- Invite user by email (creates `auth.users` + triggers `public.users` row); set initial `full_name`, role assignments, branch_ids.
- Edit user's role assignments (adds / removes rows in `user_branch_roles` with audit).
- Password reset flow from the admin surface.
- Hard deactivation that also disables `auth.users` login (not just the soft `public.users.active=false` that 7b-2b's archive does).
- Branch CRUD — current schema supports it (nullable columns already in place); just needs the UI + Server Actions.

### Hard delete with type-to-confirm
_Captured: 2026-04-20._

Phase 7b-2b left archive as reversible; hard delete deferred. Useful when:
- A test fixture leaked into production and needs to be permanently removed.
- A row was archived in error and you want to fully drop it (not just restore + re-archive).

Pattern: admin-only action behind a type-to-confirm modal ("Type `{entity_name}` to delete"). Writes a final `audit_log` row with `action='hard_delete'` and full `before_json` so the deletion is itself traceable.

### Reports v2 — charts + time-series + point-in-time aging
_Captured: 2026-04-20 (Phase 7b-2c carry-over)._

Phase 7b-2c shipped four table-based reports with CSV export. The tables answer "who / what / how much" but not "trend". Post-MVP items:

- Time-series line charts (spend per branch MoM; packer throughput week-over-week).
- Point-in-time AR aging — current 7b-2c snapshot answers "what's outstanding NOW"; finance will eventually want "what was outstanding on 2026-01-31" which requires paid-date awareness in the bucketing logic.
- Chart rendering — `recharts` or similar; defer until a real user asks.
- Low-stock alert feed — plumbed (`reorder_level` column + `StockPill`) but no proactive notification; add on the admin dashboard.

### English copy review pass
_Captured: 2026-04-20 (Phase 7 scope carry-over)._

MVP copy is functional but wasn't tone-reviewed end-to-end. A single-shot pass covering:
- Error messages (consistent "couldn't do X — Y" framing).
- Empty-state descriptions (tone, length, calls-to-action).
- Button labels (verb-first vs noun-first consistency).
- Date + number formatting (Dutch locale where appropriate: 12-04-2026 vs 2026-04-12; € before/after the number).

### Archive / Restore UX pattern — SHIPPED
_Captured: 2026-04-18. Shipped: 2026-04-20 in Phase 7b-2b (PR #33)._

Cross-cutting archive/restore across products, categories, branches, users per the BACKLOG spec. See `docs/ARCHITECTURE.md` § "Archive / Restore UX" for the shipped pattern. Keeping this entry as a historical marker — any future entity needing soft-delete UX should mirror the same pattern.

## Pre-production infrastructure

### Supabase Auth email delivery — swap to Resend (or similar)
_Captured: 2026-04-21 (discovered during Sprint 1 testing)._

Supabase's default email pipeline caps invite/reset emails at 3/hour — fine for dev, blocks real onboarding. Before first real customer:

- Configure Supabase Auth SMTP settings to point at a production email provider (Resend already in use for notification emails — reuse same sender domain if possible).
- Dedicated auth sender address (e.g. no-reply@bessemsmarketingservice.nl) with SPF + DKIM + DMARC configured on the domain.
- Test invite + password-reset flows end-to-end with real emails.
- Remove the `PHASE8_INVITE_SMOKE=1` test gate once rate limit is lifted — the full E2E test can run on every CI.

No code change needed in the app — this is Supabase dashboard configuration. Docs update only: add a section to `docs/ENV.md` or a new `docs/PRODUCTION-CHECKLIST.md` listing this + other pre-launch infra tasks.
