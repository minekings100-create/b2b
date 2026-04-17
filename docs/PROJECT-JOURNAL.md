# Project Journal

The single source of truth for **where we are right now**. Updated every time a phase lands, a PR merges, or scope is renumbered. SPEC §11 holds the authoritative numbered phase list; this journal records the chronology of what actually shipped.

## Current status

- **Project:** internal B2B procurement platform (SPEC §1).
- **Active phase:** **Phase 3 — Ordering & approval.** Starting **3.1 Cart + order submit**.
- **Last merged PR:** #13 Phase 2.5 (Category CRUD).
- **Phase 2 complete:** all sub-phases (2.1–2.5) merged. See Phase 2 roadmap below.
- **Proposed Phase 2.6** (Inbound goods & replenishment) stays on [`BACKLOG.md`](./BACKLOG.md); explicitly deferred on 2026-04-18 — may slot in after Phase 3.

## Numbering canon

Until SPEC §11 is updated, **the accepted phase numbers are the ones that ship as PR titles**. Proposals living in BACKLOG.md stay "proposed" and must not reuse an in-flight number — rename them if a phase lands in the same slot.

## Merged chronology

| Date       | PR | Phase | Title | Notes |
|------------|----|-------|-------|-------|
| 2026-04-17 |  #1 | 1.1   | Schema + RLS | Foundation tables + RLS + allocator. |
| 2026-04-17 |  #2 | 1.2   | Auth | Email/password + magic link, session middleware, callback + logout, role helpers. |
| 2026-04-17 |  #3 | 1.3   | App shell, role nav, command palette | Sidebar, role-aware dashboards, ⌘K. |
| 2026-04-17 |  #4 | 1.4   | Seed + Phase 1 acceptance | 5 branches / 20 users / 10 categories / 500 products + Playwright happy path. |
| 2026-04-17 |  #5 | 1.5   | Schema scaffolding | Accepted scope adjustment — all remaining §6 tables with RLS, no feature code. |
| 2026-04-17 |  #6 | 1.5 / demo | Rich demo data | Orders, pallets, shipments, invoices, returns, movements, audit trail. |
| 2026-04-17 |  #7 | 2.1   | Catalog browse | `/catalog` list with search, category filter, in-stock toggle, detail drawer. |
| 2026-04-17 |  #8 | 2.2   | Admin product CRUD | Create / edit / archive + audit log + images + grid view + scoped ⌘F. |
| 2026-04-17 |  #9 | 2.3   | Inventory adjustments + barcodes | Adjust with reason → `inventory_movements`; barcode add/remove. |
| 2026-04-17 | #10 | docs  | Pick-list inline detail note | Recorded Phase 4 design note in SPEC §8.3 and BACKLOG. |
| 2026-04-17 | #11 | 2.3-fix | Inventory normaliser | Re-applied PR #9 fix that was lost in squash-merge + regression test. |
| 2026-04-17 | #12 | 2.4   | CSV import | Upload → preview → commit, papaparse + Zod re-validation. |
| 2026-04-18 | #13 | 2.5   | Category CRUD | Flat taxonomy CRUD + BACKLOG renumber of inbound-goods proposal to 2.6 + new PROJECT-JOURNAL. |

## Phase 2 roadmap (status)

| Sub | Title | Status |
|-----|-------|--------|
| 2.1 | Catalog browse | ✅ merged (PR #7) |
| 2.2 | Admin product CRUD | ✅ merged (PR #8) |
| 2.3 | Inventory + barcodes | ✅ merged (PR #9, fix PR #11) |
| 2.4 | CSV import | ✅ merged (PR #12) |
| 2.5 | Category CRUD | ✅ merged (PR #13) |

## Phase 3 roadmap — Ordering & approval (SPEC §11, §8.1, §8.2)

Sub-milestones. Each one is a single PR; each targets a specific operator outcome.

| Sub | Title | Scope | Status |
|-----|-------|-------|--------|
| 3.1 | Cart + order submit | Branch user adds items from `/catalog` to a persistent draft order, edits/removes lines, submits. Submit runs the outstanding-invoice gate (SPEC §8.1 step 4), allocates `order_number` via `allocate_sequence`, flips status to `submitted`, writes audit. `/orders` list for branch users. No emails yet. | 🟡 starting |
| 3.2 | Approval queue + inventory reservations | Manager `/approvals` page: submitted orders for own branch, oldest first. Adjust `quantity_approved` per line then Approve, or Reject with required reason. Approve creates `inventory_movements` rows (`reason='order_reserved'`) per line and flips status to `approved`. Cancel path from pre-ship states. | ⚪ planned |
| 3.3 | Resend integration + emails + Phase 3 acceptance | Email adapter (SPEC §2, §11) with clean interface so SendGrid is drop-in. Trigger emails on submit (branch managers), approve (packer pool + creator), reject (creator), outstanding-invoice override (administration). Playwright happy path: branch user → submit → manager → approve; assertions + audit coverage. | ⚪ planned |

### 3.1 detail — this PR's scope

- **Data path:** cart = a persistent `orders` row at `status='draft'` for the user + branch. One active draft per (user, branch) pair to keep the model simple; if the user is assigned to multiple branches, they pick the active branch from the header.
- **Server Actions** (`src/lib/actions/cart.ts`): `addToCart`, `updateCartItemQty`, `removeCartItem`, `submitOrder`. Each re-checks `isBranchMember`, respects `products.min_order_qty` / `max_order_qty`, and audit-logs. `submitOrder` additionally runs the outstanding-invoice check and allocates the order number.
- **Validation**: Zod schemas at the trust boundary (`src/lib/validation/cart.ts` / `order.ts`).
- **UI**
  - `/catalog` product detail drawer gets an "Add to cart" section for `branch_user` / `branch_manager` (qty picker, respects min/max).
  - New `/cart` route: summarises the active draft, lines editable inline, totals recomputed server-side on each mutation, "Submit" button at the bottom.
  - New `/orders` route: lists orders visible to the caller (SPEC §5 — own-branch read for user/manager; already enforced by RLS).
  - Sidebar: Orders already exists as a stub — replace with a real list.
- **Outstanding-invoice gate**: `submitOrder` loads invoices with `branch_id = order.branch_id AND status IN ('issued','overdue') AND due_at < now()`. If any exist, refuse the submit and return a blocking error the client surfaces as the modal per SPEC §8.1 step 4. "Submit anyway" with typed `CONFIRM` escalates to an override path that lands in 3.3 (for now, block only — the override emails depend on Resend which ships in 3.3).
- **Order numbering**: `public.allocate_sequence('orders_' || extract(year from now()))` → formatted as `ORD-YYYY-NNNN`.
- **Audit**: `orders / create`, `orders / submit`, plus per-item `order_items / update` on edits.
- **Tests**: unit for order-number formatting and cart arithmetic; Playwright for cart → submit happy path + outstanding-invoice block.

## Proposed phases (not yet accepted)

Lives in [`docs/BACKLOG.md`](./BACKLOG.md). SPEC §11 is not modified until accepted.

| Slot | Title | Captured | Status |
|------|-------|----------|--------|
| 2.6  | Inbound goods & replenishment | 2026-04-17 | Proposed (renamed from 2.5 on 2026-04-18). **Deferred on 2026-04-18** — will be revisited after Phase 3. |
| cross-cutting | Archive / Restore UX pattern | 2026-04-18 | Captured in BACKLOG §Cross-cutting. Implement between Phase 6 and 7, or as Phase 7 polish — decide then. |

## How this file is maintained

- **On every merge:** append a row to the chronology and flip the sub-phase status in the roadmap. Update the "Active phase" / "Last merged PR" / "Next up" block at the top.
- **On every renumbering:** update BACKLOG.md, cross-check this file, and note the rename in the journal line.
- **When SPEC §11 changes:** call it out here with a link to the commit.
