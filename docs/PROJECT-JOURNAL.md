# Project Journal

The single source of truth for **where we are right now**. Updated every time a phase lands, a PR merges, or scope is renumbered. SPEC §11 holds the authoritative numbered phase list; this journal records the chronology of what actually shipped.

## Current status

- **Project:** internal B2B procurement platform (SPEC §1).
- **Active phase:** **Phase 3 — Ordering & approval.** In flight: **3.3.2** (in-app notification bell, this PR).
- **Last merged PRs on `main`:** #20 Phase 3.3.1 (rebased email infra), #21 Phase 3.4 docs.
- **Open / paused branches:**
  - `phase-3-3-2-notifications-bell` — this PR.
- **Phase 2 complete:** all sub-phases (2.1–2.5) merged.
- **Phase 3.2.2 complete:** 3.2.2a + 3.2.2b + 3.2.2c merged (PRs #16, #18, #19) — two-step approval live with auto-cancel.
- **Phase 3.3.1 complete:** PR #20 — email infra in console-only mode; bell consumes the same `notifications` rows.
- **Proposed Phase 2.6** (Inbound goods & replenishment) stays on [`BACKLOG.md`](./BACKLOG.md); explicitly deferred on 2026-04-18 — may slot in after Phase 3.

### Roadmap (post-Phase-3.4 acceptance, 2026-04-19)

Phase 3 splits into 3.1 / 3.2 / 3.2.1 / 3.2.2{a,b,c} / 3.3.{1,2,3} (already shipped or in flight). **Phase 3.4 — Order edit** is newly accepted and slots in after Phase 3.3.3:

| Phase | Title | Status |
|---|---|---|
| 3.1 | Cart + order submit | ✅ merged |
| 3.2 | Approval queue + reservations (single-step, superseded) | ✅ merged |
| 3.2.1 | Transparency + traceability polish | ✅ merged |
| 3.2.2a | HQ Manager role + two-step schema | ✅ merged |
| 3.2.2b | Two-step approval UI + HQ queue tabs | ✅ merged |
| 3.2.2c | Auto-cancel cron + working-days helper | ✅ merged |
| 3.3.1 | Resend integration + transactional triggers | ✅ merged (PR #20) |
| 3.3.2 | In-app notification centre (bell + dropdown) | 🟡 PR open (this branch) |
| 3.3.3 | Email preferences + polished templates + unsubscribe + legal | ⚪ planned |
| **3.4** | **Order edit (pre-approval)** | 🟡 in PR — schema (`edit_count` + `last_edited_*` + `order_edit_history`), `editOrder` action with double-guarded concurrency, `/orders/[id]/edit` UI, `<OrderEditHistory>` diff viewer, BM-approve mid-edit guard, `order_edited` notification + email + headline + timeline integration. |
| 4 | Picking & packing | 🟡 in PR — scope: pick queue, scan / manual pack, pallet management, pallet label + pick list PDFs. Shipping (§8.4) + receiving (§8.5) deferred to 4.1 / 4.2. |
| 5 | Invoicing | 🟡 in PR — createDraftInvoiceFromOrder / issueInvoice / markInvoicePaid / cancelInvoice admin actions; A4 invoice PDF; `/invoices` list + `/invoices/[id]` detail; order-detail integration; `invoice_issued` + `invoice_overdue_reminder` notifications; nightly overdue cron at 02:00 Europe/Amsterdam (DST drift tracked) with idempotent reminder ladder (7/14/30 days). No migration — reused 1.5 schema. |
| 6 | Online payment & RMA | ⚪ planned |
| 7 | Polish (incl. sortable headers, NL holidays, DST cron, archive/restore) | ⚪ planned |

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
| 2026-04-18 | #14 | 3.1   | Cart + order submit | Cart persists as draft order, outstanding-invoice gate, allocate ORD-YYYY-NNNN, audit trail. |
| 2026-04-18 | #15 | 3.2.1 | Transparency + traceability polish | ActivityTimeline + OrderStatusPill + clickable rows + approver visibility (audit_log RLS extension + users shared-branch helper). |
| 2026-04-18 | #16 | 3.2.2a | HQ Manager role + two-step approval schema | Adds `branch_approved` status, `branch_approved_*` cols, `hq_operations_manager` role, RLS for HQ + packer narrow, distinct status palette, action-oriented pill labels. Schema-only — behaviour change in 3.2.2b. |
| 2026-04-18 | #17 | e2e-fix | cart-submit reliability | Self-contained overdue-invoice fixture; replaced `waitForURL` (load-event dependency) with `toHaveURL` (URL polling). |

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

## 3.2.2 plan — HQ Manager role + two-step approval *(awaiting confirmation, 2026-04-18)*

### Status of adjacent work

- **3.3.1 (email infra) is built and pushed to `phase-3-3-1-email-infra` (commit `722e2e5`) but not merged.** Holding so 3.2.2 can land first; 3.3.1 will then be rebased on top with updated recipient sets + the new triggers listed below.
- **PR open count after 3.2.2 lands:** 3.2.2a → 3.2.2b → 3.2.2c → rebased 3.3.1. Strict serial merge.

### Scope (mirrors the user's brief, condensed)

- New role `hq_operations_manager` (display "HQ Manager"), no branch assignment (HQ is global).
- Insert `branch_approved` between `submitted` and `approved` in `order_status`.
- Branch Manager owns step 1 (`submitted → branch_approved | rejected`).
- HQ Manager owns step 2 (`branch_approved → approved | rejected | cancelled`).
- Auto-cancel on timeout: 2 working days (step 1) / 3 working days (step 2). Working days = Mon–Fri Europe/Amsterdam; holidays out of scope.
- Inventory reservations stay at step 1 (branch approval) — HQ rejection or auto-cancel at step 2 must release.
- Existing `approved` rows are not retroactively pulled back through step 1; see backfill decision below.

### PR split (refining the user's proposal)

| Sub | Title | What ships | What does NOT change |
|-----|-------|-----------|----------------------|
| **3.2.2a** | Schema + RLS + role enum + seed | Migration adds `branch_approved` to `order_status`, `branch_approved_at` + `branch_approved_by_user_id` columns on `orders`, `hq_operations_manager` to `user_role`. RLS clauses for HQ Manager (cross-branch SELECT/UPDATE on orders + audit_log + order_items). Packer SELECT narrowed to status ∈ {approved, picking, packed, shipped, delivered}. Seed adds `hq.ops@example.nl` + a few `branch_approved` orders for visual review. SPEC.md updated in the same PR (no doc drift). | Approval action still flows `submitted → approved` directly; UI unchanged. The new schema sits empty until 3.2.2b wires the behaviour. **Acceptable transitional state**: any order submitted between 3.2.2a and 3.2.2b uses the legacy path, which is harmless because the merge is sequential. |
| **3.2.2b** | Two-step approval flow + HQ queue UI | `approveOrder` becomes `branchApproveOrder` (`submitted → branch_approved`, writes audit `branch_approve`) + new `hqApproveOrder` (`branch_approved → approved`, writes audit `hq_approve`). `rejectOrder` learns both source states. `cancelOrder` adds `branch_approved` to the cancellable set + the release-reservations branch. `/approvals` page becomes role-aware: branch managers see step 1; HQ managers see a tabbed view ("Waiting for me" = `branch_approved`, "Branch-level waiting" = `submitted` read-only, "All pending"). `OrderStatusPill` colour map gains `branch_approved` (warning/amber). `ActivityTimeline.describeAction` learns the new actions. Sidebar adds an entry for HQ Manager. | Cron jobs and reminders. Email triggers (those rebase in 3.3.1). |
| **3.2.2c** | Auto-cancel cron + working-days lib + tests | New `src/lib/dates/working-days.ts` (pure module, holiday-injectable API for Phase 5 reuse). New `/api/cron/auto-cancel-stale-orders` route — finds `submitted` orders past 2 working days and `branch_approved` orders past 3 working days, cancels them with audit reason `auto_cancel_no_branch_approval` / `auto_cancel_no_hq_approval`, releases reservations on the step-2 path. `vercel.json` gets a new `0 6 * * *` UTC schedule (= 08:00 Europe/Amsterdam in winter, 09:00 CEST). Vitest suite for `working-days`. Playwright e2e: stale-order fixture + manual cron invocation + assertion that order is cancelled, reservations released, audit row written. | New email triggers (rebase to 3.3.1). |

### Schema decisions (need user signoff before 3.2.2a starts)

| # | Decision | My recommendation | Why |
|---|---|---|---|
| **S1** | Column naming for the two timestamps | Keep `approved_at` / `approved_by_user_id` as the **final** approval (HQ). Add `branch_approved_at` / `branch_approved_by_user_id` for step 1. | No rename → existing `fetchOrderDetail`, list views, RLS policies, and the activity timeline keep referencing `approved_at` with the same semantic ("fully approved"). Pure additive change. |
| **S2** | Backfill existing `approved` orders | **Backfill** `branch_approved_at = approved_at - interval '4 hours'`, `branch_approved_by_user_id = approved_by_user_id`. Insert a synthetic `branch_approve` audit row dated 4h before the real `approve` row, actor = the same approver. | Cleaner demo data — every row in the new model has both timestamps. Audit trail becomes a "best reconstruction" rather than partial. Only affects historical demo rows; pure SQL one-shot in the migration. **Alternative**: leave NULL on legacy rows and document "pre-3.2.2 single-step" — simpler but inconsistent. |
| **S3** | RLS state-machine encoding | Keep RLS coarse (tenancy + role only). Application layer enforces source-state + target-state checks. | Existing pattern (approval.ts already does `if (order.status !== 'submitted') return error`). Encoding transitions in `WITH CHECK` clauses ~doubles policy code and forces every state-machine change to ship a migration. Defense-in-depth via the app layer is acceptable for an internal tool; we already audit every mutation. **Alternative**: encode in RLS — flag if you want stricter posture. |
| **S4** | New audit action names | `branch_approve`, `hq_approve`, `auto_cancel_no_branch_approval`, `auto_cancel_no_hq_approval`. Old `approve` action stays in the audit log for legacy rows. | Avoids ambiguity in the timeline UI. `ActivityTimeline.describeAction` switch grows by 4 cases. |
| **S5** | Working-days helper location | New `src/lib/dates/working-days.ts`. API: `addWorkingDays(date, n, opts?: { tz?: string; holidays?: Date[] })`, `isWorkingDay(date, opts?)`, `workingDaysBetween(a, b, opts?)`. Pure, no DB. Vitest unit suite. | User flagged it: "we'll use it in Phase 5 for invoice due_at too". Holiday-injection at the option level means Phase 5 (or a future Phase 7 holidays-config feature) can pass NL public holidays without API churn. |

### Risks I'm flagging

1. **Reservations released on HQ rejection.** Step 1 reserves; step 2 might reject. The `cancelOrder` release path scans `order_items.quantity_approved > 0` lines and releases each — which works because `branch_approve` populates `quantity_approved`. The new `hqRejectOrder` action will reuse the same release helper. **Test:** the e2e suite must assert that an HQ rejection releases reservations (not just changes status).
2. **Packer's view shrinks.** Today packers see all orders (including `submitted`). 3.2.2a narrows that to `{approved, picking, packed, shipped, delivered}`. No existing test asserts the wider view, so nothing breaks — but a packer running an open `/orders` page during deploy would see their list contract. Acceptable for a sequential rollout; flag in 3.2.2a's PR description.
3. **Sidebar route ambiguity.** HQ Manager has no branch, so "/orders" filtered by branch makes no sense for them. Proposed label: keep route at `/orders` but the page already shows everything RLS allows; HQ's RLS sees all branches → the same page renders cross-branch automatically. Sidebar copy stays "Orders" rather than introducing a separate "All orders" route. **Confirm this is OK with you** — your spec said "show 'All orders' instead", which I'd push back on as unnecessary route duplication. The data is already cross-branch; it's just labelling.
4. **DST drift on the cron.** `0 6 * * *` UTC = 08:00 Europe/Amsterdam in winter, 09:00 in CEST (a one-hour drift twice a year). Acceptable for a once-a-day auto-cancel job. Phase 7 may revisit if customer cares.
5. **Demo seed turbulence.** Backfilling existing approved orders + inserting `branch_approved` examples means re-running `npm run seed:demo` on a non-empty DB. The demo seed is idempotent for catalog/users; need to verify it stays idempotent for the new order rows. Will validate in 3.2.2a.

### Out of scope (deferred, called out so we don't forget)

- Public holidays — not configurable until a future Phase ships an admin UI for it.
- Substitute approvers (HQ jumps in if branch times out). Explicitly rejected in user brief: "If branch-level times out, order auto-cancels — HQ doesn't jump in."
- Real-time notifications. Polling only (3.3.2 already aligned to this).
- Email triggers — these get added in the **3.3.1 rebase** after 3.2.2c merges. Tracked changes for that rebase:
  - Existing `order_approved` → repurpose as "fully approved" (HQ done) → packers. **No rename needed.**
  - Add `order_branch_approved` → HQ Managers.
  - Add `order_branch_rejected` (was `order_rejected` from `submitted`) → creator.
  - Add `order_hq_rejected` → creator + branch manager who approved step 1.
  - Add `order_auto_cancelled` → creator + branch manager + (step-2 only) HQ Managers + admins.
  - Existing `order_awaiting_approval_reminder` → split into `submitted_awaiting_branch_reminder` + `branch_approved_awaiting_hq_reminder`.

### Decisions confirmed (2026-04-18)

- **S1** — keep `approved_at` / `approved_by_user_id` for the **final** (HQ) approval; add `branch_approved_at` / `branch_approved_by_user_id` for step 1.
- **S2** — backfill historical `approved` rows + synthetic `branch_approve` audit entry per row. Lives in `20260418000006_two_step_backfill_legacy.sql`.
- **S3** — coarse RLS (tenancy + role only). Server Actions enforce source-state and target-state. Audit log + Vitest RLS suite are the safety net.
- **S4** — *clarified by user*: **one orders entry per role, never both**. Branch User / Branch Manager / Packer see "Orders" (label = scope is own-branch). HQ Manager / Administration / Super Admin see "All orders" (label = scope is cross-branch). Same `/orders` route. The role check that drives the label lives in `viewsOrdersCrossBranch(roles)` in `src/lib/auth/roles.ts`. Ships in 3.2.2b.

### 3.2.2a delivery (this PR)

| Item | File | Notes |
|---|---|---|
| Add `branch_approved` to `order_status` | `supabase/migrations/20260418000004_two_step_approval_schema.sql` | `ALTER TYPE … ADD VALUE … BEFORE 'approved'`. Partial index on `branch_approved_at IS NOT NULL` (cron-friendly) — using a status-filter would have failed because the new enum value can't be referenced inside the same migration that adds it. |
| Add `branch_approved_at` + `branch_approved_by_user_id` to `orders` | same migration | Pure additive. Existing reads/writes referencing `approved_at` keep their semantic ("fully approved"). |
| Add `hq_operations_manager` to `user_role` | `…000005_hq_operations_manager_role.sql` | Single `ALTER TYPE`. HQ has no branch assignment; existing `user_branch_roles_admin_unique` partial index already covers global roles. |
| Backfill historical approvals | `…000006_two_step_backfill_legacy.sql` | UPDATE sets `branch_approved_at = approved_at − 4h`, `branch_approved_by_user_id = approved_by_user_id`. INSERT-from-SELECT adds a synthetic `branch_approve` audit row with `after_json.synthetic = true`. Idempotent. |
| HQ RLS + packer narrow | `…000007_hq_role_rls_and_packer_narrow.sql` | `ALTER POLICY orders_select` adds HQ + narrows packer to fulfilment statuses; `ALTER POLICY orders_update` adds HQ. `order_items` and `audit_log` policies inherit transitively via existing EXISTS subqueries. |
| `roles.ts` | `src/lib/auth/roles.ts` | `ROLES` includes `hq_operations_manager`; new `isHqManager()` and `viewsOrdersCrossBranch()` helpers. `isAdmin()` deliberately unchanged — HQ is not an admin. |
| Seed updates | `scripts/seed/users.ts`, `scripts/seed/demo/orders.ts`, `scripts/seed/demo/audit.ts` | Adds `hq.ops@example.nl` (password `demo-demo-1`). Demo orders gain a `branch_approved` bucket (3 rows) and the audit seed emits a `branch_approve` row when `branch_approved_at` is set. |
| SPEC.md | §5 role matrix, §6 orders data model, §7 status flow, §8.2 two-step approval, new §8.8 auto-cancel | Schema + spec land together so doc and DB never drift. |

**Out of scope for 3.2.2a (lands in 3.2.2b/c):**

- Approval action behaviour change. The existing `approveOrder` keeps doing `submitted → approved` until 3.2.2b lands. Any order submitted between 3.2.2a and 3.2.2b uses the legacy single-step path — harmless because merges are sequential.
- `OrderStatusPill` colour map for `branch_approved` (will be `warning` / amber to indicate "mid-process") — handled in 3.2.2b.
- `ActivityTimeline.describeAction` cases for `branch_approve`, `hq_approve`, `auto_cancel_*` — 3.2.2b.
- Sidebar label switch ("Orders" ↔ "All orders") per S4 — 3.2.2b.
- Cron + working-days helper + auto-cancel — 3.2.2c.

### 3.2.2b delivery (this PR)

| Item | File | Notes |
|---|---|---|
| `approveOrder` → `branchApproveOrder` | `src/lib/actions/approval.ts` | `submitted → branch_approved`. Reservations land here (per SPEC §8.2). Audit action `branch_approve`. Form action: `branchApproveOrderFormAction`. |
| New `hqApproveOrder` | same file | `branch_approved → approved`. No quantity adjustment, no new reservations. Audit action `hq_approve`. Form action: `hqApproveOrderFormAction`. |
| `rejectOrder` accepts both source states | same file | `submitted → rejected` (BM, audit `branch_reject`); `branch_approved → rejected` (HQ, audit `hq_reject`, releases reservations via shared `releaseReservationsFor` helper). |
| `cancelOrder` adds `branch_approved` to cancellable + releases reservations | same file | Branch managers / HQ Manager / admins can cancel pre-shipped. Release path covers `branch_approved | approved | picking`. |
| Step-1 form (BM) | `src/app/(app)/orders/[id]/_components/approve-form.tsx` | Existing form re-pointed at `branchApproveOrderFormAction`; submit label "Branch-approve order". |
| Step-2 form (HQ) | `…/_components/hq-approve-form.tsx` (new) | Read-only line table + single "HQ-approve order" submit. No quantity inputs (HQ doesn't adjust). |
| Order detail role-aware buttons | `src/app/(app)/orders/[id]/page.tsx` | Renders `ApproveForm` only when `submitted` AND BM-of-branch / admin; renders `HqApproveForm` only when `branch_approved` AND HQ / admin. RejectForm + CancelForm follow the same role + state gating. New status banner surfaces both `branch_approved_by_email` and `approved_by_email` independently. |
| Approvals queue tabs (HQ + admin) | `src/app/(app)/approvals/page.tsx` | Tabbed view — "Awaiting HQ" (default, `branch_approved`), "Awaiting branch" (`submitted`, read-only), "All pending". URL-driven (`?tab=hq|branch|all`), per-tab counts in pill. Pure BM caller still sees the single-tab step-1 view. |
| `fetchApprovalQueue(statuses)` | `src/lib/db/approvals.ts` | Accepts a status filter; returns the new `branch_approved_by_email` field hydrated via a follow-up `users` lookup. |
| `fetchVisibleOrders` returns both approver emails | `src/lib/db/orders-list.ts` + `/orders` page | New "Branch-approved by" column on the orders list (HQ + admin's primary cross-branch view); existing "Approved by" remains as the HQ-step column. |
| Sidebar role-aware label | `src/components/app/app-sidebar.tsx` | "Orders" for branch-scoped roles, "All orders" for HQ / admin / super (decision S4). HQ + admin now also see the "Approvals" entry. |
| ActivityTimeline action labels | `src/components/app/activity-timeline.tsx` | Added `branch_approve`, `hq_approve`, `branch_reject`, `hq_reject`, `auto_cancel_no_branch_approval`, `auto_cancel_no_hq_approval`. Legacy `approve` / `reject` labels kept so backfilled audit rows still render cleanly. Payload summariser handles the new variants too. |

**Tests added:**

- `tests-e2e/two-step-3-2-2b.spec.ts` — 7 cases:
  - Full happy path (submit → BM approve → HQ approve), asserts both approver columns, both audit actions
  - HQ rejects from `branch_approved` → reservations released, audit `hq_reject`
  - BM rejects from `submitted` → audit `branch_reject`
  - HQ tabs: "Awaiting HQ" default, `aria-current="page"`, order rendered
  - HQ tabs: "Awaiting branch" tab shows submitted cross-branch
  - UI guard: BM doesn't see HQ-approve button on `branch_approved`
  - UI guard: HQ doesn't see BM-approve button on `submitted`
- `tests-e2e/approvals.spec.ts` rewritten for the new model: BM-approve assertion now expects `branch_approved`; cancel test now cancels from `branch_approved`; button labels updated.

**Out of scope for 3.2.2b (lands in 3.2.2c):**

- Cron + working-days helper + auto-cancel.

### In-flight orders at deploy time (carry through to 3.2.2c release notes)

When 3.2.2c (the auto-cancel cron) ships:

- Any order in `status='submitted'` with `submitted_at` more than 2 working days ago will be auto-cancelled on the next 08:00 Europe/Amsterdam cron tick.
- Any order in `status='branch_approved'` with `branch_approved_at` more than 3 working days ago will be auto-cancelled on the same tick.
- Either case: stuck orders that have been sitting longer than the new SLA — acceptable to clean them up, but operators may want to manually approve or cancel before the cron runs.
- 3.2.2c's release notes (in `docs/CHANGELOG.md`) must include this verbatim warning: *"After auto-cancel cron deploys, any orders submitted more than 2 working days ago without branch approval will be auto-cancelled on the next cron run (08:00 Europe/Amsterdam). If you have pending orders you want to keep, approve or cancel them manually before deploying 3.2.2c."*
- 3.2.2c must add a Playwright case that simulates this scenario end-to-end: insert a stale `submitted` order, hit the cron route, assert the order ends up `cancelled` with audit reason `auto_cancel_no_branch_approval`.

### 3.3.1 holding pattern

`phase-3-3-1-email-infra` (commit `722e2e5`) is paused. After 3.2.2c merges, rebase onto `main`, then update the recipient resolvers and add the new triggers (full list in the "Out of scope (deferred…)" subsection above).

**Update 2026-04-19:** rebase complete. New HEAD `d531186`, sitting on top of `b1898df` (3.2.2c on main). Step-tagged triggers wired (see SPEC §11 Phase 3 sub-list); full Playwright 186 / 6 skipped. PR awaiting review.

## Phase 3.4 plan — Order edit *(accepted 2026-04-19, no code yet)*

Pure documentation per the user's brief — implementation queued **after 3.3.1 → 3.3.2 → 3.3.3**.

### Scope

Edit a `submitted` order before it crosses into `branch_approved`. Once branch-approved, the order is frozen for the rest of its lifecycle. Per-edit details + workflow live in SPEC §8.9; data model additions in SPEC §6 (orders columns + new `order_edit_history` table); role rights in SPEC §5.

### Implementation order (when picked up)

| Step | What | Why |
|---|---|---|
| 1 | Migration: `orders.edit_count`, `last_edited_at`, `last_edited_by_user_id` + new `order_edit_history` table with RLS (own-branch read for branch users / managers; cross-branch for HQ / admin / super) | Schema first, behaviour after — same pattern as 3.2.2a |
| 2 | Server Action `editOrder` — status-guarded (`submitted` only), role-checked, computes diff, writes `order_items` updates + `order_edit_history` row + `audit_log` `order_edited` row, resets `submitted_at` | Bulk of the change |
| 3 | New route `/orders/[id]/edit` — mirrors `/cart` (qty inputs, remove buttons, "Add product" drawer) | UI |
| 4 | Edit button on `/orders/[id]` — visible iff `status='submitted' AND (creator OR BM-of-branch OR admin)` | Entry point |
| 5 | `<OrderEditHistory>` collapsible component below `<ActivityTimeline>` on `/orders/[id]` | Diff viewer |
| 6 | `ActivityTimeline.describeAction` learns `order_edited` (one-line summary; click expands the diff via the new component) | Timeline integration |
| 7 | Email trigger `order_edited` → branch managers; template includes line-count delta + total delta | Re-approval signal |
| 8 | Tests (vitest RLS + Playwright e2e covering creator-only edits, BM cross-edits, HQ blocked, status guard rejects branch_approved, audit + history rows persisted, email fired) | Acceptance |

### Risks I'm flagging early (revisit at implementation)

1. **Diff snapshot size.** Storing full `order_items` JSON in `before_snapshot` + `after_snapshot` is fine for ~50-line orders; if a future bulk-import order has 500 lines the row gets large. Acceptable for v1; revisit if Postgres complains.
2. **Reservation handling on edit.** Edits happen *before* `branch_approved`, which is when reservations land. So edits never need to release / re-reserve inventory. Confirmed safe by design.
3. **Concurrent edit race.** Two users editing simultaneously could clobber each other. Add an `if-match`-style version check (`UPDATE … WHERE updated_at = $expected`) in `editOrder` to detect the race and return a friendly "this order changed under you, refresh" error.
4. **Edit during the BM's approval review.** If a BM is on the approval form when the user saves an edit, the BM submits stale `quantity_approved` values. The status-guarded UPDATE in `branchApproveOrder` already returns "0 rows affected" if status changed — extend the same pattern to also trip when `last_edited_at` advanced past what the form was rendered with. Surface as "the order was just edited; please review again".
5. **Email storm.** Repeated edits would trigger repeated `order_edited` emails. Defer for v1; debounce in 3.3.3-style preferences if it becomes annoying.

### Open questions for the user before 3.4 starts

1. Should the BM's approve form auto-refresh when the underlying order is edited mid-review, or just refuse the submit with a "refresh" error? (My instinct: refuse + force-refresh, matches the existing concurrency pattern.)
2. Should `editOrder` accept zero-line orders (i.e. user removes every line)? Or treat removing the last line as an implicit cancel? (Lean: refuse, force the user to use the explicit Cancel action — clearer audit trail.)
3. `edit_reason` column on `order_edit_history` is plumbed but unused. Add a UI "Why are you editing? (optional)" field on the edit page now, or leave for Phase 7? (Lean: leave — extra friction without proven need.)

## How this file is maintained

- **On every merge:** append a row to the chronology and flip the sub-phase status in the roadmap. Update the "Active phase" / "Last merged PR" / "Next up" block at the top.
- **On every renumbering:** update BACKLOG.md, cross-check this file, and note the rename in the journal line.
- **When SPEC §11 changes:** call it out here with a link to the commit.
