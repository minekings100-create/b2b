# Backlog

Feature notes and future refinements we want to remember but haven't built yet. Organised by the SPEC §11 phase in which they'll land, so each entry sits near the code that will implement it. Add to this file whenever an idea comes up mid-phase that shouldn't derail the current sub-phase.

Each entry follows the shape:

- **One-line title**
- _Captured: YYYY-MM-DD_
- What it is, why it matters, and any design pointers.

---

## Phase 2 — Catalog & inventory

_(none yet)_

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

_(none yet)_

## Cross-cutting

_(none yet)_
