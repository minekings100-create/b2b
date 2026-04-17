# Project Journal

The single source of truth for **where we are right now**. Updated every time a phase lands, a PR merges, or scope is renumbered. SPEC §11 holds the authoritative numbered phase list; this journal records the chronology of what actually shipped.

## Current status

- **Project:** internal B2B procurement platform (SPEC §1).
- **Active phase:** Phase 2 — Catalog & inventory. **Sub-phase in review: 2.5 Category CRUD**.
- **Last merged PR:** #12 Phase 2.4 (CSV import).
- **Next up once 2.5 merges:** Phase 3 (Ordering & approval) — unless the proposed **Phase 2.6** (Inbound goods & replenishment, BACKLOG) is accepted and slotted in first.

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
| 2026-04-18 | #13 | 2.5   | Category CRUD | (In review) Flat taxonomy CRUD + BACKLOG renumber of inbound-goods proposal to 2.6. |

## Phase 2 roadmap (status)

| Sub | Title | Status |
|-----|-------|--------|
| 2.1 | Catalog browse | ✅ merged (PR #7) |
| 2.2 | Admin product CRUD | ✅ merged (PR #8) |
| 2.3 | Inventory + barcodes | ✅ merged (PR #9, fix PR #11) |
| 2.4 | CSV import | ✅ merged (PR #12) |
| 2.5 | Category CRUD | 🟡 in review (PR #13) |

## Proposed phases (not yet accepted)

Lives in [`docs/BACKLOG.md`](./BACKLOG.md). SPEC §11 is not modified until accepted.

| Slot | Title | Captured | Status |
|------|-------|----------|--------|
| 2.6  | Inbound goods & replenishment | 2026-04-17 | Proposed (renamed from 2.5 on 2026-04-18) |

## How this file is maintained

- **On every merge:** append a row to the chronology and flip the sub-phase status in the roadmap. Update the "Active phase" / "Last merged PR" / "Next up" block at the top.
- **On every renumbering:** update BACKLOG.md, cross-check this file, and note the rename in the journal line.
- **When SPEC §11 changes:** call it out here with a link to the commit.
