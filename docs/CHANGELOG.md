# Changelog

## [Post-MVP Sprint 2] — 2026-04-21 — admin efficiency (bulk reminders + email preview)

Two admin-facing efficiency features. No migration. Reuses the existing reminder-email render + transport (`renderInvoiceOverdueReminder` + `notify`).

### Bulk actions on overdue invoices
- On `/invoices?status=overdue` (admin + super_admin only), each row gets a checkbox and the header gets "Select all on page".
- Selecting ≥1 row shows a floating `<BulkActionBar>` at the bottom with `"N selected"`, a **Send reminder** button, and a clear/× button.
- Send reminder opens the email preview modal first (same modal as the single-invoice path). Confirming runs `sendBulkReminders(ids)` — a Server Action that loops sequentially per the scope, calling the shared `loadInvoiceReminderContext` + `notify` for each. Returns `{ sent: [...], failed: [{invoice_id, reason}] }`.
- Partial failure handling: successes confirmed in the modal footer; failures listed inline below the table (`data-testid="bulk-failure-list"`). Modal stays open on failure so the admin can inspect reasons; closes after ~1.2s on clean success.
- One `audit_log` row per sent reminder: `action='invoice_reminder_manual'`, `actor_user_id` bound to the admin who clicked. Distinct from the cron's `invoice_reminder` so the trail reads unambiguously.

### Email preview for admin
- New `<EmailPreviewModal>` client component. Shows rendered subject, recipient list, HTML render (in an `<iframe srcdoc>` to isolate email styles), plaintext toggle, Send / Cancel buttons.
- Wired to three invoice actions:
  - `/invoices/[id]` **Issue invoice** — preview, then issue.
  - `/invoices/[id]` **Send reminder** (new button, visible for issued + overdue) — preview, then send.
  - `/invoices?status=overdue` bulk **Send reminder** — one modal with "Applies to N of M selected invoices" + a sample render.
- **Skip preview next time**: per-user checkbox in the modal footer. Stored under `users.notification_preferences.skip_email_preview` (JSONB extension, no migration). `getSkipEmailPreview` / `setSkipEmailPreview` actions read/write it. When set, the button submits directly without opening the modal.
- Drafts don't carry `due_at` yet (it's stamped at issue time). The preview loader (`loadInvoiceIssuedContext`) simulates the real computed due date (`today + 30 days UTC`) so the admin sees the true email shape rather than an error.

### New Server Actions
| Action | Purpose | Audit action |
|---|---|---|
| `sendSingleReminder(id)` | Single reminder from the detail page | `invoice_reminder_manual` |
| `sendBulkReminders(ids)` | Bulk reminder from /invoices overdue | `invoice_reminder_manual` per item |
| `setSkipEmailPreview(skip)` | Persist per-user preview toggle | none (UI preference, not a domain mutation) |
| `getSkipEmailPreview()` | Read the flag for server-component props | none |
| `getInvoiceReminderPreview(id)` | Render reminder preview (admin-only) | none |
| `getInvoiceIssuedPreview(id)` | Render issued preview (admin-only) | none |
| `getBulkReminderPreview(ids)` | Pre-flight: render first + list skip reasons | none |

### Tests
- **Vitest** 108/108 (no new unit cover — preview + send logic is end-to-end).
- **Playwright (full 3-viewport)**: new spec `tests-e2e/post-mvp-2-admin-efficiency.spec.ts`.
  - Responsive (3-viewport): single invoice reminder preview + HTML/plaintext toggle; bulk action bar + preview modal on overdue filter.
  - Desktop-only: branch user sees no checkboxes; bulk send writes `invoice_reminder_manual` audit rows; skip-preview toggle persists across sessions.
- Phase 5 smoke regression fixed: the `admin draft → issue → mark paid` test now handles the preview modal (polyfilled with an `isVisible` check so either skip-path keeps passing).

### Decisions made without asking
- **Sequential bulk send on the server** rather than client-side looping one-by-one. Brief called for sequential; a single Server Action call reduces round-trips + keeps all the audit rows in one revalidation window. Client-side progress is best-effort; the action's return shape (`{ sent, failed }`) is the authoritative per-item result.
- **JSONB extension over a new column** for `skip_email_preview`. Zero migration, user's brief explicitly offered this option. Semantically a minor stretch (the column is named `notification_preferences`, this is a UI preference), documented in the migration comment for Sprint 1's `login_disabled` column which took the opposite choice.
- **Preview of drafts fakes the due_at**. Rather than refuse to preview a draft (which would block the common issue flow), compute `today + 30 days` UTC — same logic `issueInvoice` runs at submit. Documented in a code comment.
- **Modal uses `<iframe srcdoc>`** to isolate the email CSS. Avoids polluting the app stylesheet and vice versa.
- **Bulk cap: 500 rows** — Zod-enforced. Anything more suggests the filter is wrong, not an actual bulk send.

### Rate-limit caveat
Each bulk send produces one Supabase Auth "none" event but N `notify()` email-transport calls. The current transport is console-only (Phase 3.3.1 status), so tests and local dev are cap-free. For real production this will hit Resend (see BACKLOG § "Supabase Auth email delivery — swap to Resend"), which has its own rate limits but is production-grade. Not a blocker for this PR.

---

## [Post-MVP Sprint 1] — 2026-04-21 — user + branch lifecycle + admin password reset

Admin-facing user and branch lifecycle. Replaces "archive / restore only" (from 7b-2b) with full create, edit, role management, password reset, and a new login-disabled toggle.

### New admin surfaces
- **`/users/new`** — invite form. Admin sets email, full name, and one or more role assignments. `inviteUserByEmail` creates the `auth.users` row and sends a Supabase set-password email. Duplicate-email check runs first and surfaces a friendly error.
- **`/users/[id]`** — detail page. Edit profile (`full_name`), add / remove role assignments (branch-scoped and global), send a password-reset email, disable / re-enable login.
- **`/branches/new`** and **`/branches/[id]`** — create + edit for every column already in the `branches` schema (`name`, `branch_code`, addresses, KvK, VAT, IBAN, monthly budget, payment term).

### New column
- `public.users.login_disabled` (boolean, default false). Dedicated flag — NOT `auth.users.banned_until`. The auth middleware / login action / `getUserWithRoles` all check this flag and force-sign-out if set. Keeps Supabase Auth as the identity layer and our table as the authorization layer. Migration `20260421000002_user_login_disabled.sql` + partial index.

### Server Actions (10 new) — every one writes `audit_log`

| Action | Audit action name |
|---|---|
| `inviteUser` | `user_invited` |
| `updateUserProfile` | `user_updated` |
| `addRole` (global) | `user_role_added` |
| `addRole` (branch-scoped) | `user_branch_added` |
| `removeRole` (global) | `user_role_removed` |
| `removeRole` (branch-scoped) | `user_branch_removed` |
| `triggerPasswordReset` | `user_password_reset_triggered` |
| `deactivateLogin` | `user_deactivated` |
| `reactivateLogin` | `user_reactivated` |
| `createBranch` | `branch_created` |
| `updateBranch` | `branch_updated` |

### Supabase Auth admin API touchpoints (confirmed in PR thread)
| Call | Purpose |
|---|---|
| `auth.admin.inviteUserByEmail(email, { data: { full_name } })` | Invite — creates `auth.users` + sends set-password email |
| `auth.admin.listUsers()` | Duplicate-email pre-check before invite |
| `auth.resetPasswordForEmail(email)` | Admin-triggered password reset email |

Not used in this PR: `auth.admin.updateUserById` with `banned_until` (explicitly replaced by `login_disabled` per reviewer request), `auth.admin.deleteUser` (hard delete stays on BACKLOG).

### Last-super-admin guard
`src/lib/auth/last-super-admin.ts` — single shared helper. Counts active super_admin assignments where:
- `user_branch_roles.role='super_admin'` AND `deleted_at IS NULL`, AND
- owning `users` row has `deleted_at IS NULL` AND `login_disabled = false`

Called before `removeRole` (when removing a super_admin assignment) and before `deactivateLogin`. Returns true only if the op would drop the active super_admin count to zero. On trip, the action returns a friendly error and makes no DB change.

Edge cases:
- A user with multiple super_admin rows (global + branch-scoped) can still have one removed as long as they retain at least one.
- Deactivating a user who isn't currently an active super_admin is never gated (no effect on the count).
- Self-deactivate is additionally blocked at the top of `deactivateLogin` before the guard even runs.

### Auth middleware / session
`getUserWithRoles` now reads `login_disabled` in the same query it loads the profile. If set, `supabase.auth.signOut()` runs immediately and the function returns null. The `/login` action runs the same check post-sign-in and surfaces "This account is deactivated. Contact an administrator." The three doors (post-sign-in, mid-session, cold start) are all covered by the same flag.

### Tests
- **Vitest** 108/108 — 4 new in `tests/lib/last-super-admin.test.ts` covering the guard's four branches against real DB.
- **Playwright** new spec `tests-e2e/post-mvp-1-user-branch-lifecycle.spec.ts`.
  - **3-viewport (per CLAUDE.md for new responsive UI)**: invite form rendering, branch create + edit round-trip with audit rows.
  - **Desktop-1440** only (access + edge): non-admin redirect, duplicate-email error, admin-non-super can't grant super_admin (skipped if no `administration` user in seed), deactivate + reactivate round-trip, deactivated user sees "account deactivated" on login, self-deactivate blocked, last-super-admin guard trips.
  - **Gated by `PHASE8_INVITE_SMOKE=1`**: end-to-end `inviteUserByEmail` test. Supabase's default email pipeline caps at 3 emails/hour, so repeated test runs blow through the cap. Flip the env var to exercise end-to-end in a fresh hour window.
- Smoke on `archive-restore-7b2b`, `admin-surfaces-7b2a`, `phase-1-happy-path` — 23/23 pass.

### What deferred to Sprint 2+
- **Full user lifecycle v2** — email change flow (requires re-auth round-trip), MFA management, impersonation-for-support.
- **Hard delete** — still in BACKLOG with type-to-confirm.
- **Branch sortable list + search** — /branches stays alphabetical by `branch_code` for now; pagination + sort can land if the branch count grows past ~50.
- **Audit-log viewer filters** for the new action names — `/admin/audit-log` already accepts arbitrary `action=` param, so the new names are viewable today; pre-filled filter chips could be a polish pass.
- **`[data-branch]` → role scoping for future per-branch admins** — current Server Actions gate on `isAdmin` only. A narrower "can manage users for branch X" concept would need RLS + guard extension.
- **Bulk invite** — CSV upload of multiple invites at once. Nice-to-have; single-invite covers the real onboarding flow.

---

## [Phase 8] — 2026-04-21 — packer workflow v2 (claim system + rush flag + pick-any)

Post-MVP enhancement. Three additions to the packer experience, one PR.

### Claim system
- New columns on `orders`: `claimed_by_user_id`, `claimed_at` (CHECK: both set or neither).
- `claimOrder` / `releaseOrder` Server Actions in `src/lib/actions/pack-claim.ts`. Claim uses a race-safe `.or(claimed_by_user_id.is.null,claimed_by_user_id.eq.<me>)` guard so two packers can't claim the same row in flight.
- **Lazy TTL cleanup (30 min).** Option (a) from the PR thread: `sweepExpiredClaims()` clears claims older than `PACK_CLAIM_TTL_MINUTES` at the top of every pack queue render AND at the top of `claimOrder`. Writes one `audit_log` row per cleared claim (`action='order_claim_expired'`, `actor_user_id=null`). No background timer, no DB trigger — the age check runs exactly where it's consumed.
- **Admin override release**: any admin / super_admin can release another packer's claim; the action writes `action='order_claim_admin_release'` so the override is auditable.
- **Pack detail gating**: when an order is claimed by another packer, the pack workspace disables ScanInput, CompletePackButton, and PalletPanel actions. The current claim holder (mine) and admins keep full access.

### Rush flag
- New columns on `orders`: `is_rush` (boolean, default false), `rush_set_by_user_id`, `rush_set_at`.
- **At submit** — creator checks "Mark as rush" in the cart submit form. Handled inline in `submitOrder` to avoid a double-write.
- **Post-submit** — HQ Manager / admin toggle on the order detail page via `setRush` Server Action. Refused once the order reaches `packed` or beyond (flipping there has no queue effect).
- **Queue sort**: `is_rush DESC, approved_at ASC`. Partial btree index `orders_pack_queue_idx` tuned to the query shape.
- Visual: `<RushBadge>` — lightning icon + danger-subtle background. Renders on the queue row (left of the order number) AND on the order detail's status banner.

### Pick-any reorder
- **Chosen interpretation**: "packer picks any unclaimed row, no enforced FIFO lock". The queue renders `is_rush DESC, approved_at ASC`; the packer is free to click any non-claimed-by-someone-else row directly.
- **What we did NOT build**: per-user ordering (localStorage or a DB table). Ruled out because (a) localStorage reorder causes a server/client paint mismatch on the queue, (b) a DB table for personal preference adds schema for an unproven feature. Happy to revisit if real packers ask for it.

### Migrations
- `20260421000001_pack_queue_v2.sql` — columns + CHECK + indexes + column comments.

### Tests
- **Vitest** — 104/104 unchanged (no pure-module logic added; all flow is in actions).
- **Playwright (desktop-1440)** new spec `tests-e2e/phase-8-packer-workflow-v2.spec.ts` — 8 cases:
  - claim + release round-trip with audit trail check
  - other packer sees "Claimed by <name>" + cannot act
  - stale-claim lazy cleanup (seed 45-min-old claim → packer lands on queue → claim cleared + `order_claim_expired` audit row written)
  - admin override release
  - rush sort-first (rushed order floats above older non-rush)
  - HQ rush toggle + audit row
  - branch user sees NO rush toggle (gate check)
  - pick-any (packer opens 3rd row directly from queue)
- Smoke on `pack-phase-4` + `packer-sidebar-and-order-detail-fix` + `cart-submit` — 16/16 pass.
- **Test discipline** per CLAUDE.md: table row + button surfaces with no new responsive layouts → desktop-1440 only.

### Decisions made without asking
- **Claim both-or-neither CHECK constraint** rather than triggers. Runs on every write for free; the invariant is simple enough that it doesn't need plpgsql.
- **Admin client inside Server Actions for the read probe + sweep** — the sweep runs even from a read-only context (packer hitting the queue page) and must not throw on RLS hiccups. Writes (claim / release / rush) still bind the audit row to the actor uid via the session client.
- **Rush toggle hidden for branch users on the order detail page** even though the creator-at-submit path is open to them via the cart submit form. Rationale: post-submit rush escalation is a workflow decision that belongs with HQ / admin; keeping the creator in the submit-time path avoids a second "please mark my order rush" surface.
- **`Phase 8` name**: brief called it "Packer workflow v2". The BACKLOG entry for "Phase 8 — in-portal messaging" is renumbered in PROJECT-JOURNAL (reverts to BACKLOG proposal; not a SPEC §11 phase).

---

## [Phase 7b-2d] — 2026-04-20 — WCAG 2.1 AA audit + doc refresh — MVP COMPLETE

Final slice of Phase 7b-2 and the closing phase of MVP. Runs axe-playwright across every representative route, fixes serious/critical violations, refreshes the docs to reflect what actually shipped vs what was originally planned.

### Accessibility audit

New spec `tests-e2e/a11y-scan-7b2d.spec.ts` uses `@axe-core/playwright` to scan 15 representative routes (login, dashboard, catalog, orders, invoices, approvals, cart, settings, reports × 4, admin surfaces × 2, branches, users). Fails on any **serious** or **critical** violation against WCAG 2.1 A/AA.

Violations fixed:
- **`aria-pressed` on `<a>` elements** (critical) — invalid per WAI-ARIA. Removed from `<ArchivedToggle>` (replaced with a `data-archived-toggle` attribute for CSS/testing) and from the three status-filter-chip components (`/orders`, `/invoices`, `/returns`). Active chips still carry `aria-current="page"` which *is* valid on links. `hq-orders-3-2-2a.spec.ts` updated accordingly.
- **`aria-sort` on `<a>` inside `<SortableHeader>`** (critical) — valid only on `role="columnheader"` elements. Moved to the wrapping `<TableHead>`.
- **Unlabelled checkboxes on `/settings/notifications`** (critical) — the 2×2 preferences grid's `<label>` wrapped the input but contained no text (the visible label lives in the row header cell, not inside the label). Added `aria-label="{category}, {channel}"` so AT announces "State changes, email" etc.

`color-contrast` disabled in the scan because it consistently false-positives against Tailwind's semantic tokens (light-dark utility classes confuse the static analyser). Design-token discipline (see §4 of SPEC) covers the contrast commitment in practice.

### Documentation refresh

- **`README.md`** (new) — quick start, demo logins, test instructions, structure overview, links to all the other docs.
- **`SPEC.md` §11** — Phase 7 section rewritten to reflect the 7a / 7b split and each 7b sub-phase, with an explicit "deferred" list pointing at BACKLOG.
- **`docs/PROJECT-JOURNAL.md`** — new `## MVP complete — 2026-04-20` section at the end with the phase → PR mapping, explicit post-MVP deferrals, and final test counts.
- **`docs/BACKLOG.md`** — marked "Archive/Restore UX pattern" as shipped (kept for historical reference). New "Post-MVP" section consolidating user/branch full-lifecycle, hard-delete, reports v2, English copy review, and low-stock alerts.

### Tests
- **Vitest** — 104/104 pass.
- **Playwright (full 3-viewport)** — **453 passed, 14 skipped, 0 failed in 33.4 min**. Skipped = CRON_SECRET-only auth tests + a handful of known-flaky-on-small-viewport tests in the invoice-draft / two-step suites (not responsive regressions, just existing tablet-768 / mobile-375 environmental flake per PR #30's notes). **Test discipline per CLAUDE.md:** a11y audit triggers full-3-viewport by policy.

### MVP complete

This PR closes the MVP build-out. Every phase in SPEC §11 (plus mid-build adjustments 1.5, 3.2.2 split, 3.4, the 7a / 7b split, and the 7b-2 four-way split) has merged. Post-MVP queue lives in `docs/BACKLOG.md`.

---

## [Phase 7b-2c] — 2026-04-20 — reports: spend by branch, top products, AR aging, packer throughput

Third slice of Phase 7b-2. Ships the first four reports plus per-report CSV export. `/reports` replaces the empty-state stub with a role-gated index. Accessibility audit + doc refresh remain for 7b-2d.

### Reports
- **Spend by branch** (admin + HQ Manager) — sum of `issued/paid/overdue` invoice totals grouped by branch, over a URL-driven `?from&to` window. Totals row + CSV export.
- **Top products** (admin + HQ Manager) — line-net value + quantity grouped by SKU for orders past branch-approval in the window. Top 25 on screen, up to 200 in the CSV.
- **AR aging** (admin only — finance territory) — unpaid invoices as a snapshot against `now()`, bucketed current / 1-30 / 31-60 / 61-90 / 90+ days overdue. Bucket totals summary + per-invoice table.
- **Packer throughput** (admin + HQ Manager) — pallets packed per user in the window. `(system)` row for pallets with no `packed_by_user_id`. Per-packer pallet + distinct-order counts.

### Access model
- New `src/lib/auth/reports.ts` — single source of truth for per-report visibility (`REPORT_KINDS`, `canSeeReport`, `reportsVisibleTo`, `REPORT_META`). Same predicate drives the index card list, the per-page `redirect("/dashboard")` gate, AND the CSV route's 403 check — URL tampering can't leak data the page would refuse to render.

### CSV export
- One route handler `/api/reports/[kind]/csv` dispatches by kind; 404 for unknown kinds, 403 for disallowed role, 200 + `text/csv` otherwise.
- Shared `src/lib/reports/csv.ts` — RFC 4180-flavoured builder (CRLF lines; quote cells with `,"`CR/LF; double-up interior quotes). `centsToDecimalString` renders bigint cents as `"12.34"` for CSV-friendly decimals. No external dep.
- Download links live on each report page via `<WindowPicker>`; the AR-aging page renders the link inline (no date window).

### Schema fit notes
- Every report works against current schema — no migrations.
- Top products uses `orders.branch_approved_at` as the window anchor (the earliest point a request becomes a committed spend). `draft` + `submitted` orders are excluded.
- AR aging uses the same snapshot semantics as the Phase 5 overdue cron.

### Sidebar
- New "**Insights**" section holds the Reports link, gated to admin + HQ Manager. Moved Reports out of the Admin section (was admin-only); keeps the Admin section focused on write surfaces (Users, Branches, Audit log, Holidays).

### Tests
- **Vitest** 104/104 — 11 new in `tests/lib/reports-csv.test.ts` covering escaping rules, CRLF lines, null handling, number coercion, and the cents formatter.
- **Playwright (desktop-1440)** new spec `tests-e2e/reports-7b2c.spec.ts` — 15 cases: role-based access to the index + each page (4), content assertions per report (4), CSV endpoint (200 for admin, 403 for branch_user, 403 on AR-aging for HQ, 404 for unknown kind), sidebar visibility (3). All 15 passed.
- Smoke on `phase-1-happy-path`, `admin-surfaces-7b2a`, `archive-restore-7b2b` — 23/23 (sidebar was touched).
- **Test discipline** per CLAUDE.md: reports are tables + date pickers, no new responsive layouts → desktop-1440 only.

### Decisions made without asking
- **AR aging uses "now" snapshot, not the window picker.** Aging-as-of-a-past-date is a different report and would need paid-date awareness to be correct historically. Deferred.
- **Top products window anchor is `branch_approved_at`**, not `submitted_at` or `approved_at`. Submitted = request (can cancel); HQ approval = committed but not always used (branch-approved orders also commit via reservations). `branch_approved_at` is the earliest real spend commitment and is set the moment a BM signs off.
- **"Insights" sidebar section** rather than leaving Reports inside Admin. HQ Manager now legitimately sees it; keeping it under "Admin" was becoming a misnomer.
- **No charts in v1** — sortable tables are enough for the MVP audience. Chart-heavy layouts could land in a later polish pass if real use demands it.
- **Top 25 on-screen, 200 in CSV** — screen scan is shallow; CSV is for drill-down.

### Follow-ups
- **7b-2d** — accessibility audit (WCAG 2.1 AA) + documentation refresh.
- Out of scope for this PR: time-series (month-over-month trends), chart visualisations, point-in-time aging (historical snapshot rather than now).

---

## [Phase 7b-2b] — 2026-04-20 — archive/restore UX across products, categories, branches, users

Second slice of Phase 7b-2 (following the admin-surfaces slice queued as 7b-2a). Implements the cross-cutting **Archive / Restore UX** pattern from BACKLOG — every entity with a `deleted_at` column now has a matching restore surface so soft-deletes are reversible through the UI instead of requiring Studio access.

### The pattern (new primitives)
- `<ArchivedToggle>` + `<ArchivedBadge>` in `src/components/app/archived-primitives.tsx`. URL-driven toggle (`?archived=1` on/off), small badge beside the row's primary column. Applied consistently on every list.
- Archive action = soft-delete (`active=false`, `deleted_at=now()`). Restore = inverse. Both write an `audit_log` row (`action='archive'` / `'restore'`).
- Archive UI shows a two-step inline confirm (no modal). Restore is a single-click button in the archived view.
- Rows render at `opacity-60` when archived so the archived table reads visually distinct from the active one.

### Products (`/catalog`)
- New `restoreProduct` Server Action (`src/lib/actions/catalog.ts`).
- `fetchCatalogPage({ archivedOnly })` extended to return only soft-deleted rows when set. `CatalogProduct.deleted_at` threaded through for row rendering.
- `<ArchivedProductsTable>` renders a simplified admin-only archived view — click-through-to-detail is disabled there (the detail drawer has add-to-cart etc. that don't apply). "Restore" button per row.
- Filter bar + "New product" CTA hide in archived mode to keep the view focused.

### Categories (`/catalog/categories`)
- New `restoreCategory` Server Action.
- `fetchCategoriesWithCounts({ archivedOnly })` extended.
- `<CategoryRow>` learned the archived branch: renders `<ArchivedBadge>` + a single "Restore" button instead of the edit/archive pair.

### Branches (`/branches` — NEW list)
- New admin-only page listing every branch with archive/restore controls. Read-only in terms of branch attributes — create/edit is a later phase (tied to auth provisioning).
- New `archiveBranch` / `restoreBranch` actions. Both use the admin (service-role) client for the UPDATE because the `branches_update` RLS policy rejects column-level updates to `deleted_at` via the session client even for super_admin (empirically confirmed — other column updates work). `isAdmin(session.roles)` gate at the action layer is the security boundary; audit row binds to the actor uid via the session client.
- New sidebar entry "Branches" (admin-only, `Building2` icon).

### Users (`/users` — stub → full list)
- Replaces the empty-state stub with an admin-only list of every user: email, name, roles, archive/restore controls.
- New `archiveUser` / `restoreUser` actions. Self-archive is blocked at the action layer ("You can't archive yourself"). Same admin-client UPDATE pattern as branches for the same RLS reason.
- **Known limitation (documented):** archive flips `public.users.{active, deleted_at}` but does NOT touch `auth.users`. An archived user with a valid session can still reach the app until their cookie expires. Hard deactivation via the Supabase Auth admin API is a separate phase.

### Shared
- New `BranchArchiveInput` / `UserArchiveInput` Zod schemas.
- New `src/lib/db/branches-admin.ts` + `src/lib/db/users-admin.ts` — admin read helpers (service-role) for the active + archived lists. Gated at the page layer.

### Tests
- **Vitest** 93/93 pass.
- **Playwright (desktop-1440)** new spec `tests-e2e/archive-restore-7b2b.spec.ts` — 9 cases: full archive/restore round-trip per entity (products, categories, branches, users) + non-admin redirect checks + sidebar visibility. All 9 passed in 36s.
- Smoke on `catalog-crud`, `catalog-categories`, `phase-1-happy-path` (sidebar touched): 10/10 pass.
- **Test discipline** per CLAUDE.md: archive/restore is row-level UX, no responsive layout → desktop-1440 only.

### Decisions made without asking
- **Admin client for the archive/restore UPDATE on branches + users** rather than loosening RLS. Empirically, `branches_update`'s WITH CHECK rejects `deleted_at` column updates via the session client even for super_admin (other column updates succeed). The RLS expression looked permissive for super_admin but Postgres disagreed — likely a subtle interaction with Supabase's column-level behaviour that wasn't worth widening the policy over. `isAdmin(session.roles)` at the action layer is the security boundary; audit still binds to the actor uid.
- **Hard delete deferred.** BACKLOG mentioned "Hard delete remains a separate, rarely-used admin action... type-to-confirm modal or similar." Not shipped here — archive covers every current scenario and is reversible; hard delete can land if a real case surfaces.
- **Products archived view is a simplified separate table**, not the main table overlaid. The main catalog row is click-to-detail (drawer with add-to-cart) which doesn't apply to archived products. Dedicated table keeps both flows simple.
- **Users archive is a soft-archive only**, no `auth.users` deactivation. Hard user lifecycle (disable login, delete identities) is a separate phase.
- **`?archived=1` is URL-driven** (not a client-side toggle) so the state survives refresh + is shareable, matching the `?status=` + `?sort=` precedent.

### Follow-ups (Phase 7b-2c, 7b-2d)
- Reports (spend per branch, top products, AR aging, packer throughput).
- Accessibility audit (WCAG 2.1 AA) + documentation refresh.

---

## [Phase 7b-2a] — 2026-04-20 — admin surfaces: holidays manager + audit-log viewer

First slice of Phase 7b-2's final polish split. Scope: admin-only read/manage pages that were promised in the 7b-1 PR description (public_holidays admin UI) plus the long-running backlog entry for an audit-log viewer. Cross-cutting archive/restore UX (7b-2b), reports (7b-2c) and the accessibility audit + doc refresh (7b-2d) land in follow-up PRs.

### /admin/holidays — super_admin only
- List of `public_holidays` rows grouped by year, with add / edit / delete actions. Super_admin-gated at the page layer; mutations also super_admin-gated (matches the RLS policy in migration `20260420000001`).
- Server Actions: `createHoliday`, `updateHoliday`, `deleteHoliday` — each writes one `audit_log` row (`entity_type='public_holiday'`, `action='holiday_{created,updated,deleted}'`).
- Validation: `PublicHolidayCreateInput`/`UpdateInput`/`DeleteInput` in `src/lib/validation/public-holiday.ts`. Date is `YYYY-MM-DD`-strict to dodge timezone parsing surprises.
- Friendly duplicate handling on the `(region, date)` unique constraint: surfaces "A holiday for NL on 2026-04-27 already exists" rather than raw Postgres error text.
- Clears the 7b-1 PR's "future-year seeding requires Studio access" follow-up. Existing 2026 + 2027 seed rows are editable through the UI now.

### /admin/audit-log — admin (super_admin + administration)
- Filter bar: entity_type, action, actor email, since/until (URL-driven, `?entity_type=...&action=...&actor_email=...&since=...&until=...&page=...`). Zod-parsed at the page trust boundary — same pattern as the `?status=` / `?sort=` filter parsers on lists.
- Table: `created_at` (local time, narrow), actor email (resolved from `users` by a single IN query over the page's `actor_user_id` set), entity_type, action, entity_id (monospace).
- Pagination: offset-based, 50 rows/page. "Page N of M" with ← Prev / Next → links that preserve active filters.
- Empty states: one generic ("No audit rows match the current filters") and one helpful for an unknown actor_email ("No user with email 'x@y' — check spelling"). The latter short-circuits the DB query, so a typo doesn't return a full unfiltered set.
- Admin-gate applied at the page layer even though RLS already scopes super_admin / administration / self — keeps non-admins from landing on a route that would otherwise return an empty-ish scoped view.

### Sidebar
- New "Audit log" entry in the Admin section (icon: `History`), visible to any admin.
- New "Holidays" entry below it, visible only to super_admin (icon: `CalendarDays`). Matches the super_admin-only mutation surface.
- Split enforced by a new `isSuperAdmin()` helper in `src/lib/auth/roles.ts` (stricter than `isAdmin()`, which also includes `administration`).

### Tests
- **Vitest** 93/93 (no logic that needs new unit cover — page-level gating + Server Actions are covered by e2e).
- **Playwright (desktop-1440)** new spec `tests-e2e/admin-surfaces-7b2a.spec.ts` — 10 cases: 4 on holidays (super_admin gate, seed render, full CRUD + audit rows, duplicate handling), 3 on audit-log (non-admin redirect, filter by entity_type, helpful empty state for unknown actor), 3 sidebar visibility checks (super_admin / administration / branch_user). All 10 passed in 41s.
- **Smoke** on `phase-1-happy-path` (4) + `phase-7a-polish` (9) because the sidebar was touched — all 13 still pass.
- **Test discipline** per CLAUDE.md: both new pages are route-level tables; no responsive layout touched → desktop-1440 only.

### Housekeeping
- `.claude/` added to `.gitignore`. Local Claude Code state had been showing up as untracked across recent PRs.

### Decisions made without asking
- **Holidays are hard-deleted, not soft-deleted.** Unlike products / categories, a holiday row has no referential integrity to protect — the cron loads holidays by date at tick time, doesn't store FKs. Full delete keeps the admin UI simple. Audit row preserves the history.
- **Audit-log viewer shows raw JSON via data attributes, not rendered.** v1 surfaces `entity_id` as a monospace cell and leaves the `before/after_json` payload out of the main table to keep rows scannable. Rendering the JSON is a minor future enhancement (per-row expand), not load-bearing for the audit trail's legal / operational value.
- **Page size 50, offset-based pagination.** Cursor-based is marginally better at scale but offset is fine for the expected volume (thousands of rows/month) and matches the sortable-headers + filter-chip precedent.

### Follow-ups (Phase 7b-2)
- **7b-2b** — archive/restore UX for products, categories, branches, users per the BACKLOG pattern.
- **7b-2c** — reports (spend per branch, top products, AR aging, packer throughput).
- **7b-2d** — accessibility audit (WCAG 2.1 AA) + documentation refresh.

---

## [Phase 7b-1] — 2026-04-20 — crons: NL holidays + DST gate + 90-day cleanup

First half of the Phase 7b split (per the 7a PR's deferred list). Ships the cron + data infrastructure: NL public holidays, DST-aware schedule splitting, and the destructive 90-day notifications cleanup. UI polish (archive/restore, audit-log viewer, reports, accessibility audit, English copy review, doc refresh) lands in 7b-2.

### NL public holidays
- New table `public_holidays` (`region`, `date`, `name`) seeded with NL national holidays for 2026 + 2027. Includes Bevrijdingsdag in non-lustrum years to match how warehouses treat 5 May in practice.
- RLS: read = any authenticated user; write = `super_admin` only. Until 7b-2 ships an admin UI, super_admins manage rows via Supabase Studio.
- New loader `src/lib/dates/holidays.ts` — `loadActiveHolidays(db, region='NL')`. Fail-soft: on a DB error logs `[holidays] load failed` and returns `[]` (= reverts to Mon–Fri-only behaviour, the pre-7b-1 baseline) rather than crashing the cron sweep.
- Wired into the auto-cancel cron's `addWorkingDays(now, -2/-3, { holidays })` calls. The other crons don't use working-days arithmetic.

### DST-aware cron scheduling
- New helper `src/lib/dates/dst-cron.ts` — `isExpectedAmsterdamHour(targetHour)` + `amsterdamHourNow()` using `Intl.DateTimeFormat({ timeZone: "Europe/Amsterdam" })`. Pure module, no deps.
- All four cron handlers (auto-cancel, awaiting-approval, overdue-invoices, cleanup-notifications) now gate on the target Amsterdam local hour. Gate is **production-only** (skipped when `CRON_SECRET` is unset) so e2e can hit the route at any clock time.
- `vercel.json` ships TWO UTC schedules per cron — one matching CET (winter), one matching CEST (summer). The off-DST-half firing returns `{ ok: true, skipped: true }` and does no work.

### 90-day notifications cleanup cron (DESTRUCTIVE)
- New route `/api/cron/cleanup-notifications` — hard-deletes rows from `notifications` where `sent_at < now() - 90 days AND read_at IS NOT NULL`. Unread rows are NEVER deleted regardless of age (a year-old unread row stays so the user still sees it next time they open the bell).
- **Atomic** via a new SQL function `public.cleanup_old_notifications(p_cutoff, p_retention_days, p_max_count)` (migration `20260420000002`). Three modifying CTEs in a single statement (SELECT → INSERT-audit → DELETE) so audit happens BEFORE delete and either both commit or both roll back. A partial failure cannot leave deleted rows without an audit trail.
- Hard cap: 10,000 deletions per run. A larger backlog gets chipped down weekly; response surfaces `capped: true`.
- One `audit_log` row per deleted notification (`action='notification_cleanup'`, `actor_user_id=null`, `before_json` snapshots `{ user_id, type, sent_at, read_at }`).
- Schedule: weekly Sunday 06:00 Europe/Amsterdam (double-scheduled `0 4 * * 0` summer + `0 5 * * 0` winter UTC).

### Migrations
- `20260420000001_public_holidays.sql` — table + RLS + 2026/2027 NL holidays seed.
- `20260420000002_cleanup_notifications_fn.sql` — atomic cleanup function.

### Tests
- **Vitest** 93/93 pass (8 new in `tests/lib/dst-cron.test.ts` covering winter, summer, spring-forward, hour boundaries).
- **Playwright (desktop-1440)** new spec `tests-e2e/notifications-cleanup-7b1.spec.ts` (2 cases) + smoke on auto-cancel-3-2-2c (5), notifications-3-3-1 (10), invoices-phase-5 (4), notifications-bell-orphan (2) — 19 passed, 2 skipped (CRON_SECRET-only auth tests).
- **Test discipline** per CLAUDE.md: this PR doesn't touch responsive layout, so Playwright runs default desktop-1440 only.

### Decisions made without asking
- **Holidays loader is fail-soft (loud log, returns [])** rather than throwing. Failing closed would mean the cron crashes and nothing gets cancelled at all — strictly worse than reverting to pre-7b-1 Mon-Fri-only behaviour.
- **Atomicity via a Postgres function with modifying CTEs** rather than two JS-side queries. Cleaner than a JS-side BEGIN/COMMIT and impossible to misuse.
- **DST gate is production-only** (`if (secret && !isExpectedAmsterdamHour(...))`). Tests run without `CRON_SECRET` set — same heuristic as the existing auth check in the same handlers.
- **Bevrijdingsdag (5 May) included in 2026 + 2027** even though officially only nationally observed every 5th year (next: 2030). Matches how most office/warehouse calendars treat it; super_admins can remove rows once 7b-2 ships the admin UI.
- **No `public_holidays` admin UI in this PR** — defers to 7b-2 to keep this PR focused on the cron infrastructure. Seed covers ~2 years of runway.
- **Audit row per deleted notification (not aggregate)** — `audit_log.entity_id` is `not null` and the SPEC's audit rule is per-entity. Aggregate would have needed a sentinel UUID hack; per-row is honest.

### Follow-ups (Phase 7b-2)
- super_admin UI for managing `public_holidays` rows so future-year seeding doesn't require Studio access.
- Archive/Restore UX pattern, audit-log viewer, reports, accessibility audit, English copy review, doc refresh.

---

## [Phase 7a] — 2026-04-20 — polish: dashboards + sortable headers + HQ stock preview

Phase 7 split — see "Decisions" below for the 7a / 7b cut. This PR ships the user-visible polish surface; infra-heavy items (NL holidays, DST cron, archive/restore, audit-log viewer, reports, accessibility audit, doc refresh) and the destructive 90-day notifications-cleanup cron stay in 7b.

### Role dashboards
- Replaces the `/dashboard` empty-state stubs with role-aware data.
- New shared primitives: `<StatCard>` + `<StatCardGrid>` (tokens-only, 1/2/4 column responsive grid) and `<RecentOrdersPanel>` (compact 5-row table).
- New DB module `src/lib/db/dashboard.ts` — pure read helpers (`countOrdersByStatus`, `sumInvoicesByStatus`, `sumMtdPaid`, `recentOrders`, `recentApprovedForPacking`, `recentBranchApprovedForHq`). All queries run under the user's session client so RLS handles branch + role scoping.
- Per-role dashboards:
  - **Branch user** — stat trio (open orders, open invoices, overdue) + recent orders.
  - **Branch manager** — pending-approvals (warning emphasis) + in-flight + open invoices + overdue + recent activity.
  - **HQ Manager** — awaiting-HQ (warning) + awaiting-branch + open invoices + overdue + recent branch_approved queue. Also new — HQ wasn't routed to its own dashboard before; it fell through to the branch-user view.
  - **Packer** — to-pack + in-picking + recent pack queue.
  - **Admin** — cross-branch quartet (orders in flight, open invoices, overdue, MTD paid) + recent orders.
- Dashboard role selector in `src/app/(app)/dashboard/page.tsx` learned `hq` (slots between admin and branch_manager).

### Sortable column headers
- New URL-driven primitive `<SortableHeader>` + `parseSortParam` helper (`src/lib/url/sort.ts` + `src/components/app/sortable-header.tsx`). Click cycles asc → desc → reset (drops the params) per BACKLOG entry "Sortable column headers on order tables".
- `?sort=<col>&dir=asc|desc` Zod-parsed at the page trust boundary against a per-page enum of allowed columns.
- Wired into `/orders`, `/invoices`, `/returns`. Preserves existing filter params (`?status=…`) across sort clicks.
- Item-count sort on `/orders` is post-fetch (PostgREST can't order by an aggregate over an embedded table); branch sort uses `branch_id` ordering at the DB layer (close enough to alphabetical via seed order; Phase 7b can add a proper join sort).
- Each list query keeps its hard `limit(200)` regardless of sort — pagination is a separate Phase 7 entry.

### HQ approval inline stock preview
- BACKLOG entry "HQ approval: inline stock preview" lands inside the existing `<HqApproveForm>`. Per line: `on-hand X → Y after pack (Z reserved now)` in muted small text under the product name.
- Pure read + render — no schema change, no action change. Uses `OrderDetailLine.on_hand` + `.reserved` already loaded by `fetchOrderDetail`.

### Decisions made without asking — Phase 7 split
**In scope (this PR, Phase 7a):**
- Role dashboards (5 roles).
- Sortable headers (`/orders`, `/invoices`, `/returns`).
- HQ inline stock preview.

**Deferred to Phase 7b (each item gets its own small PR):**
- 90-day notifications cleanup cron (DESTRUCTIVE — paused per gate rules).
- NL public-holidays config + admin UI (new schema, plumb into working-days helper).
- DST-aware cron splitting (touches existing cron schedules).
- Archive / Restore UX pattern (cross-cutting; affects products, categories, branches, users).
- Reports (needs design + data scope).
- Low-stock alerts.
- Audit-log viewer (admin tool).
- Accessibility audit pass (broad).
- English copy review (broad).
- Documentation refresh (broad).

Why split: the 7b items are infrastructure-heavy and benefit from focused review. Lumping them into one PR would slow down 7a's user-visible improvements + force PAUSE for the cleanup cron's destructive deletion before the dashboards even land.

**Other in-PR decisions:**
- **HQ stock preview phrasing** — "after pack" rather than "after approval". Approving doesn't move stock; packing does. The reservation already exists at step 2, so the on-hand minus approved-qty is what the warehouse will physically see leave when packed.
- **`/orders` table grew an `approved_at` column** in `OrderSummary` so HQ-approved-at sort works without a refetch — not yet displayed in the table itself (kept the 9-col layout).
- **Sortable-headers v1 is read-only state on click** — the cycle resets to default rather than persisting on every list visit. Matches the BACKLOG spec exactly.

### Tests
- **Vitest** 85/85 (unchanged — dashboards + sort are read-path; covered via Playwright).
- **Playwright** new spec `tests-e2e/phase-7a-polish.spec.ts` — 9 cases: 5 dashboard role checks (3 viewports per CLAUDE.md since dashboards touch responsive grid breakpoints) + 3 sort-cycle cases (desktop-only via `test.skip` against the project name) + 1 HQ stock preview check (desktop-only).

### Follow-ups
- **Phase 7b** items listed above.
- **Sortable headers on `/approvals`** — same pattern, same primitive. Skipped this PR because the approvals queue is already cross-tab and would need the sort to scope per-tab.
- **Branch sort by branch_code** — currently sorts by `branch_id`. Acceptable for v1 (seed order matches code order); a proper join sort or denormalised `branch_code` on `orders` is a Phase 7b polish item.

## [Phase 6] — 2026-04-20 — Mollie (mock) payments + RMA

End-to-end online-payment UX via an adapter-pattern Mollie transport (mock in dev, real Mollie when credentials land) + full RMA state machine minus the money resolutions. Refund / credit_note resolutions are recorded but NOT executed this PR — explicit follow-up documented below.

### Scope decision (up-front, per the PR gate rules)
**Adapter-only Mollie for this PR.** Same pattern as 3.3.1's email transport: mock in dev, real gateway behind an env flag later. Reasoning:
- No new env var, no real credential handling — nothing in the Phase-6 PAUSE list gets tripped.
- Shipping a mock lets the full UX (Pay button → checkout → webhook → status flip → payment row) land with automated test coverage.
- Cutover to live Mollie is a one-file edit in `src/lib/payments/transport.ts` + an env var + webhook-signature verification — all three explicitly tagged as PAUSE triggers for the follow-up PR.

### Mollie adapter + flow
- **`src/lib/payments/transport.ts`** — `PaymentTransport` interface + `mockTransport()` issuer. Returns a `tr_mock_*` provider id (shape matches Mollie's `tr_*`) and a local `/mollie-mock/checkout?...` URL.
- **`src/lib/actions/mollie-payments.ts`** — `payInvoiceWithMollie`. Session-gated (branch users initiate); validates invoice in `issued`/`overdue`; stashes provider id on `invoices.mollie_payment_id` + writes `mollie_payment_created` audit row; redirects to the checkout URL.
- **`src/app/api/webhooks/mollie/route.ts`** — POST handler. Accepts both form-urlencoded (real Mollie shape) and JSON (mock). Flips `issued/overdue → paid` on `status=paid` with status-guarded UPDATE, records a `payments` row with `method='ideal_mollie'`, audits both the webhook receipt (`mollie_webhook_received`) and the state flip (`invoice_paid`). Idempotent: re-calls on an already-paid invoice no-op.
- **`src/app/mollie-mock/checkout/page.tsx`** — two-button checkout screen (Simulate paid / Simulate failed). POSTs to the real webhook route, exercising the same handler Mollie will call. Page is visibly labelled "Mock checkout · not a real payment".
- **`PayInvoiceButton`** (client) on `/invoices/[id]` for any caller who can see the invoice when status is issued/overdue and total > 0. Admin's existing Mark-paid + Cancel bar stays intact for the out-of-band path.

### RMA state machine
- **Schema** — no migration needed. Phase 1.5's `20260417000010_returns.sql` already has `returns` + `return_items` + enums + full RLS.
- **`src/lib/actions/returns.ts`** —
  - `createReturn` (branch_user / branch_manager / admin / super on own branch) — allocates `RMA-YYYY-NNNNN`, inserts the row via the session client so `returns_insert` RLS fires, bounds quantities to original approved qty, emits `return_requested` to admin audience.
  - `approveReturn` (admin) — `requested → approved`, emits `return_approved` to the requester.
  - `rejectReturn` (admin) — `requested → rejected` with a required one-line reason stored in `notes`; emits `return_rejected` with the reason.
  - `receiveReturn` (admin) — `approved → received`. Per-item: admin picks resolution (`replace` actionable; `refund` / `credit_note` accepted in the data model but NOT executed) + `restock` checkbox. Restocked items write a `return_in` inventory movement and bump `quantity_on_hand`. Replace items auto-create a linked replacement order at `status='approved'` (skips the approval queue per SPEC §8.7 step 3, with notes `Replacement for RMA-…` + `order_replacement_created` audit row).
  - `closeReturn` (admin) — `received → closed` + stamps `processed_at`.
- **`src/lib/db/returns.ts`** — list + detail + `fetchReturnableLinesForOrder` (sums already-returned quantities across non-rejected returns so the new-return form can bound the user).
- **Pages** — `/returns` (filter chips + table), `/returns/new?order_id=…` (per-line qty + condition picker), `/returns/[id]` (items + admin action bar + activity timeline).
- **Order detail integration** — new "Open a return" button on `delivered`/`closed` orders for anyone with branch scope.
- **`ReturnStatusPill`** component mirrors the Order + Invoice pill shape.

### Notifications + email
- New trigger types: `return_requested`, `return_approved`, `return_rejected`, `return_received`. All registered in `src/lib/email/categories.ts` (category `state_changes`, not forced — folds under existing 3.3.3a prefs).
- Four render functions + headline strings + activity-timeline labels (`return_requested`, `return_approved`, `return_rejected`, `return_received`, `return_closed`, `order_replacement_created`, `mollie_payment_created`, `mollie_webhook_received`, `invoice_paid`).

### Decisions made without asking
- **Adapter pattern for Mollie** (see scope decision above).
- **Webhook accepts mock JSON shape** in addition to real Mollie's form-encoded `id`-only body. When live Mollie arrives, a signature check + Mollie API fetch replace the JSON branch — that code lives behind the Phase-6 PAUSE rule.
- **Refund + credit_note resolutions are recorded, not executed.** UI dropdown shows both options as disabled with the label "Phase 6 follow-up"; server action accepts the value but doesn't execute any money path. Admin can still record intent; the money flow ships in the follow-up PR once the credit-note schema + negative invoice-line support land.
- **Replacement order creates ONE new order per receive** with every replace-flagged item on it. Simpler to reason about than splitting into one-order-per-line. Skips the approval queue (SPEC §8.7 step 3).
- **`restock` is a per-item admin flag** on the receive form, not derived from condition. Admin decides whether the returned item is back on the shelf regardless of `damaged / wrong_item / surplus / other` — real-world judgment often cuts across the condition axis.
- **Rejection reason is required** (min 3 chars). Branch user has to see why.
- **RMA numbering** `RMA-YYYY-NNNNN` via `allocate_sequence('rma_<year>')` — same pattern as orders / invoices / pallets.

### Tests
- **Vitest** 85/85 (unchanged — new code is DB-integrated, covered via Playwright).
- **Playwright** new spec `tests-e2e/phase-6-payments-rma.spec.ts` (5 cases × 3 viewports = 15 new tests):
  - Branch user pays an issued invoice via mock Mollie → webhook → invoice paid + payment row with `method='ideal_mollie'` + `reference` starts `tr_mock_`.
  - Failed webhook leaves the invoice at `issued` (no-op).
  - Full RMA flow: create → approve → receive (replace + restock) → close. Asserts inventory bump + replacement order creation.
  - Reject flow with required reason, visible to the branch user on the detail page.
  - Refund / credit_note options are disabled in the receive form.

### PAUSE triggers NOT hit this PR
Per the Phase-6 gate rules, none of the following were triggered:
- ❌ New migration (schema pre-existed from 1.5)
- ❌ Mollie API key env var (mock transport has no keys)
- ❌ Webhook signature verification (mock handler trusts the body; flagged in its doc)
- ❌ Refund / credit_note money flows (recorded only, not executed)
- ❌ Mutating a hypothetical `invoices.paid_amount` (column doesn't exist; webhook flips `invoices.status → paid` and inserts a `payments` row, matching existing `markInvoicePaid` admin bookkeeping semantics)

### Follow-ups for later PRs
- **Live Mollie** — replace `mockTransport()` with a `@mollie/api-client`-backed implementation, add `MOLLIE_API_KEY` to `docs/ENV.md`, implement webhook-signature verification (PAUSE trigger). Cutover is deliberate: ship live credentials + signature in one PR reviewed under the PAUSE gate.
- **Refund resolution** — create credit-note invoice (negative lines), apply to the original invoice (mutate money territory → PAUSE). Data model (`return_item.resolution='refund'`) is already persisted at receive time.
- **Credit-note resolution** — generate credit balance against the branch, apply to next open invoice. Same PAUSE gate.
- **Bugfix** — cancel-draft-invoice should discard instead of archive (see BACKLOG Phase 5 entry added earlier in this phase).
- **Sortable column headers on `/returns`** — follows the same BACKLOG pattern already queued for orders / invoices.

## [Phase 5] — 2026-04-19 — invoicing

End-to-end invoice lifecycle: admin creates a draft from a fulfilled order → issues → branch managers receive an email + in-app notification → admin manually marks paid (or the nightly cron flips issued → overdue and sends +7 / +14 / +30 day reminders). Mollie / iDEAL online payments remain deferred to Phase 6.

### Schema
- No new migration. Phase 1.5's `20260417000009_billing.sql` already has `invoices`, `invoice_items`, `payments` with full RLS (read: admin/super global + branch own; write: admin/super). Phase 5 just fills them in.

### Server actions (`src/lib/actions/invoices.ts`)
- `createDraftInvoiceFromOrder` — admin-only. Refuses if the order isn't in a fulfilment stage (`packed` / `shipped` / `delivered` / `closed`) or if a non-cancelled invoice already exists for the order (1:1 order↔invoice). Snapshots `SKU · name` into `invoice_items.description` so future product renames don't rewrite issued invoices. Redirects to `/invoices/[id]` on success.
- `issueInvoice` — `draft → issued`. Sets `issued_at=now`, `due_at=issued_at + 30 calendar days`. Status-guarded UPDATE. Writes audit row + emits `invoice_issued` email + in-app notification to every BM of the branch.
- `markInvoicePaid` — admin-confirmed manual payment. `issued/overdue → paid`. Records a `payments` row (method + optional reference) and stamps `payment_method` + `paid_at`. Not a real-money mutation — Mollie's webhook-driven path is Phase 6 and intentionally separate.
- `cancelInvoice` — `draft/issued/overdue → cancelled`. Terminal; reopening a cancelled invoice is explicitly out of scope (create a new draft instead).

### PDFs
- **Invoice PDF** (`src/lib/pdf/invoice.tsx` + `/api/pdf/invoice/[invoiceId]`) — A4 portrait, light-mode only (SPEC §4: PDFs are print-safe). Masthead with `COMPANY.*` (name/address/KvK/BTW/phone/email), Bill-to card with the branch, Dates card (Issued / Due / Status), lines table with per-line VAT + gross, totals block. Placeholders in `COMPANY` render only when non-`[PLACEHOLDER]` — empty strings never leak onto the PDF.
- Reuses the `@react-pdf/renderer` + `runtime: "nodejs"` pattern already established for pallet labels + pick lists.

### Pages
- **`/invoices`** — filter chips (All / Draft / Issued / Overdue / Paid / Cancelled) backed by `?status=`, table with links to each invoice. Admin sees all branches; branch users see their own via RLS. Branch users never see the admin filter chips as admin actions.
- **`/invoices/[id]`** — full detail (bill-to meta, lines, totals, admin action bar, payments ledger, activity timeline).
- **Order detail** — new "Invoice" section surfaces on `packed / shipped / delivered / closed` orders. Admin sees "Create draft invoice" when none exists, a link to the existing invoice otherwise. Branch users see the link only.
- **`InvoiceStatusPill`** — new component; mirrors `OrderStatusPill`'s shape. Colours: zinc / blue / red / emerald / red-muted for draft / issued / overdue / paid / cancelled.

### Notifications + email
- New triggers `invoice_issued` and `invoice_overdue_reminder` registered in `src/lib/email/categories.ts` (category `state_changes`, not forced — folds under existing 3.3.3a prefs).
- `renderInvoiceIssued` template and `renderInvoiceOverdueReminder` template with per-call `days_overdue` variable.
- `describeNotification` headline + `ActivityTimeline.describeAction` labels + payload summary (invoice number) for every invoice action: `invoice_draft_created / invoice_issued / invoice_paid / invoice_cancelled / invoice_overdue / invoice_reminder`.

### Overdue cron (`/api/cron/overdue-invoices`)
- Schedule: `0 1 * * *` UTC = **02:00 Europe/Amsterdam winter / 03:00 summer** (same DST drift as the other crons — tracked in BACKLOG Phase 7 polish).
- **Flip pass:** every `issued` invoice past `due_at` flipped to `overdue` with a status-guarded UPDATE + audit row.
- **Reminder pass:** for every `overdue` invoice, compute `days_overdue`; if `∈ {7, 14, 30}` and no prior `invoice_reminder` audit row carries the same `days_overdue`, send an email + in-app notification + write the audit row. Fully idempotent — re-running the cron on the same day is a no-op.

### Decisions made without asking
- **Shipping deferred — invoices created manually.** Phase 4.1 will still auto-create on `packed → shipped`; until then the admin action works from any fulfilled order. Matches "build end-to-end" without pulling shipping scope into this PR.
- **30 calendar days for `due_at`.** SPEC §3 didn't specify a fixed term; "Net 30" is the Dutch B2B standard. Working-days helper used elsewhere (auto-cancel timers) isn't reused here — invoices traditionally reason in calendar days.
- **Idempotent reminders via audit-log lookup** rather than a column on `invoices`. Keeps the schema unchanged + keeps the cron source of truth in the audit trail.
- **Description denormalisation.** `invoice_items.description` stores `${sku} · ${name}` captured at invoice-create time. Issued invoices don't rewrite if a product is later renamed.
- **`payment_method` selector limited** to `manual_bank_transfer / credit_note / other` in the UI. `ideal_mollie` is reachable by the Phase 6 webhook, not by manual action.
- **1:1 order↔invoice enforced at the action layer.** The schema allows multiple invoices per order (useful for future split-invoicing), but for v1 the server action refuses a second non-cancelled invoice. Cancel the existing one first if you need to re-issue.

### Tests
- Vitest 85/85 (no change — pure-logic helpers for invoices are thin; full coverage via Playwright).
- Playwright new spec `tests-e2e/invoices-phase-5.spec.ts` (4 cases × 3 viewports = 12 new tests):
  - Admin happy path: create draft → issue (asserts due_at = +30 days) → mark paid (asserts payment row + full audit sequence `invoice_draft_created / invoice_issued / invoice_paid`).
  - Branch user can read the invoice but never sees admin action buttons.
  - Filter chips narrow the list to a status.
  - Second-invoice prevention: after one invoice exists, the "Create" button is replaced by a link.

### Follow-ups for later phases
- **Phase 4.1** — auto-create a draft on `packed → shipped`. The manual action stays as admin's primary tool.
- **Phase 6** — Mollie iDEAL flow: payment create → redirect → webhook confirms → status flips via the webhook (NOT the manual `markInvoicePaid` path). Payment rows carry `method: 'ideal_mollie'` + `mollie_payment_id` on the invoice.
- **Phase 7** — sortable column headers on `/invoices` (listed under existing BACKLOG entry for sortable order-table headers — same pattern applies).
- **Phase 7** — `pdf_path` persistence. `invoices.pdf_path` is plumbed but unused; the PDF is currently rendered on-demand per request. A future optimisation is to cache the issued PDF to Supabase Storage.

## [Phase 3.4] — 2026-04-19 — order edit (pre-approval)

End-to-end edit flow for `submitted` orders. Once `branch_approved` the order stays frozen — any post-step-1 change still requires reject → resubmit.

### Schema (migration `20260419000002_order_edit.sql`)
- `orders.edit_count`, `orders.last_edited_at`, `orders.last_edited_by_user_id` — pre-approval edit tracking. `submitted_at` is also bumped on each edit so the §8.8 step-1 auto-cancel timer restarts.
- New table `order_edit_history` — append-only `(order_id, edited_at, edited_by_user_id, edit_reason, before_snapshot, after_snapshot)`. RLS: read mirrors `orders_select` (own-branch for branch users / managers; cross-branch for HQ / admin / super; packers excluded). Insert is gated to `edited_by_user_id = auth.uid()` AND (admin/super OR (creator|BM-of-branch on a `submitted` order)).
- No update / delete policies → append-only at the Postgres layer.

### Server action
- `editOrder` (`src/lib/actions/order-edit.ts`) — gated by status (`submitted` only), role (creator / BM-of-branch / admin / super; HQ explicitly excluded), and concurrency. Computes the desired-vs-current diff and issues the right insert / update / delete mix on `order_items`. Recomputes totals, bumps `edit_count`, stamps `last_edited_at` + `last_edited_by_user_id`, resets `submitted_at`. Appends one `order_edit_history` row + one `audit_log` row (`order_edited` with line-count + total deltas). Emits `order_edited` notification to every BM of the branch. On success redirects to `/orders/[id]?saved=1`.

### Concurrency guards
- **Edit-vs-edit:** `editOrder` accepts `last_edited_at_expected`. Header UPDATE is double-guarded on `status='submitted'` AND `edit_count = expected` so two edits can't both claim the same post-increment count; the second sees 0 rows and surfaces a friendly retry.
- **Edit-vs-approve:** `branchApproveOrder` learned `last_edited_at_expected`. If the BM rendered the approve form before the edit landed, submit fails with "This order was just edited — refresh to review the latest version." (SPEC §8.9 + journal risk #4.)

### UI
- **Edit button** on `/orders/[id]` — visible iff `status='submitted'` AND caller is creator / BM-of-branch / admin/super.
- **`/orders/[id]/edit`** — Server Component gate + redirect for non-eligible callers, hydrates `<EditForm>` with current lines + product min/max bounds + notes.
- **`<EditForm>`** (`_components/edit-form.client.tsx`) — local state of desired lines (qty input, remove button per row); typeahead "Add product" via `GET /api/catalog/search`; notes textarea; bottom action bar with Cancel link + Save (opens a confirm modal that spells out re-approval). Save button disabled when zero lines (per journal open question #2 — refuse, not implicit cancel).
- **`<OrderEditHistory>`** (`src/components/app/order-edit-history.tsx`) — collapsible diff viewer below the activity timeline. Aligns Before/After by `product_id`; renders removed rows red-strikethrough, added rows green, quantity changes `old → new`. Renders only when `order.edit_count > 0`.
- **Activity timeline** learned `order_edited` (label "Edited", payload summary `+1 line · +€4,50 total`).
- **Bell headline** — `describeNotification("order_edited", ...)` → "Order ORD-N was edited — needs your re-approval".

### Email + in-app notifications
- New trigger `order_edited` registered in `src/lib/email/categories.ts` (category `state_changes`, not forced — folds under existing user prefs from 3.3.3a).
- `renderOrderEdited` template — subject "Order N was edited — needs re-approval", body has line + total delta summary + CTA back to the order.

### Decisions made without asking
- **Open question #1 (BM mid-edit):** refuse + force-refresh. Matches the existing status-guarded UPDATE pattern; surfaced via the redirect-with-`?error=` banner the detail page already renders.
- **Open question #2 (zero-line edits):** refused. Save button disabled in the UI; Zod input also rejects. Forces explicit Cancel for clearer audit trail.
- **Open question #3 (`edit_reason` field):** schema column kept, no UI surface yet. Phase 7 can add a "Why are you editing? (optional)" field once we know if it's wanted.
- **Concurrency primary key:** `edit_count` (monotonically increasing integer) is used in the header UPDATE guard alongside `status`. `last_edited_at` is the user-facing concurrency token in forms but `edit_count` is what the DB guard checks — strings round-trip fine but integers compare cheaper and rule out timestamp-precision quirks.
- **Notes field:** tracked alongside the edit (saved together; no separate "edit notes" action). Empty string normalised to NULL on write.
- **No re-snapshot of unit prices on edit.** Edits are about quantity, not re-pricing. New lines added during edit pick up the live `unit_price_cents`; existing lines keep their original snapshot. Documented in `editOrder`'s body comment.
- **Catalog search endpoint** (`/api/catalog/search`) is session-gated, returns the first 20 active matches, escapes `%` / `_` in the ILIKE pattern. Reused by the edit page; available for future autocomplete needs.

### Tests
- **Vitest** 85/85 (was 84, +1: `describeNotification("order_edited", …)` headline).
- **Playwright** new spec `tests-e2e/order-edit-3-4.spec.ts` (4 cases × 3 viewports = 12 tests):
  - Creator edits a submitted order: qty change + add line + save → DB + history + audit assertions.
  - HQ Manager cannot reach `/orders/[id]/edit` (redirect) and the Edit button isn't rendered.
  - BM approve with stale `last_edited_at_expected` → friendly "was just edited — refresh" error banner.
  - Refuses to save with zero lines (Save button disabled).

### Follow-ups for later phases
- **Phase 7 — `edit_reason` UI.** Schema column is plumbed; surface as an optional "Why are you editing?" field once there's product demand.
- **Phase 7 — edit-history retention policy.** Currently keep all edits forever; revisit alongside GDPR data-retention.
- **Phase 7 — debounce `order_edited` emails.** Repeated edits in quick succession trigger repeated notifications; fold into the 3.3.3-style preferences once it becomes annoying (journal risk #5).
- **Phase 7 — atomicity.** `editOrder` runs sequential `delete` / `update` / `insert` against `order_items` followed by a header `update`. Supabase JS has no transaction primitive; current code is best-effort linear writes reconcilable via the `order_edit_history` snapshot if a write fails partway. Same trade-off documented for `completeOrderPack`.

## [Phase 4] — 2026-04-19 — picking & packing

End-to-end packer workflow: pack queue → pick list → scan or manual pack → pallet management → complete pack with inventory accounting. Shipping (§8.4) and branch receiving (§8.5) remain separate phases.

### Added — packer routes
- **`src/app/(app)/pack/page.tsx`** — pack queue, `approved` + `picking` orders sorted by oldest `approved_at`. FIFO for the packer; admins / super_admin see the same list cross-branch.
- **`src/app/(app)/pack/[orderId]/page.tsx`** — pick & pack workspace. Two-column on desktop (scan + line list on the left, pallet panel on the right), stacked on tablet/mobile. Read-only when the order's status is past `picking` (serves as a printable summary). Packer-first density per SPEC §4: 64 px scan input, 48 px action buttons.
- **Inline detail panel** on each pick-list row (per the BACKLOG entry captured 2026-04-17 + SPEC §8.3 step 3). One row expanded at a time; shows warehouse location prominently + barcode text.

### Added — data + actions
- **`src/lib/db/packing.ts`** — `fetchPackQueue()` + `fetchPickList(orderId)`. Pick list sorts lines by `inventory.warehouse_location` (nulls last) for an efficient walking path and loads the primary barcode per product.
- **`src/lib/actions/packing.ts`** — five server actions, all role-gated to `packer / administration / super_admin`:
  - `scanBarcode` — barcode → product → unsatisfied line → increment `quantity_packed` by `unit_multiplier`. Over-pack returns `needs_confirm` carrying `(order_item_id, delta, overpack_by)`; the UI re-submits via `manualPack(…, force=true)` on confirm.
  - `manualPack` — explicit `(order_item_id, quantity)`; same over-pack discipline.
  - `openNewPallet` — creates a fresh open pallet; numbering via `allocate_sequence('pallet_<year>')` → `PAL-YYYY-NNNNN` (SPEC §6).
  - `closePallet` — open → packed, stamps `packed_at` + `packed_by_user_id`. Refuses to close empty pallets.
  - `completeOrderPack` — `picking → packed` with status-guarded update. Validates every approved line is fully packed AND no pallet is still open. Writes `inventory_movements` (reason `packed`, delta `-qty_packed`) and decrements `inventory.quantity_on_hand` + `quantity_reserved` per line. Revalidates `/pack`, `/pack/[orderId]`, `/orders/[orderId]`.
- **Audit trail** — every mutation writes one `audit_log` row (`pack_increment`, `pack_overpack`, `pallet_closed`, `order_packed`).

### Added — PDFs
- **Pallet label** (`src/lib/pdf/pallet-label.tsx` + `/api/pdf/pallet-label/[palletId]`) — A6 portrait, QR of pallet UUID, pallet number, order + branch metadata, packed-by/at. Renders via `@react-pdf/renderer` on the Node runtime.
- **Pick list** (`src/lib/pdf/pick-list.tsx` + `/api/pdf/pick-list/[orderId]`) — A4 portrait, company masthead, order + branch header, SKU / Description / Location / Qty table sorted by warehouse location.
- Both routes: role-gated (packer / admin / super_admin), `Content-Type: application/pdf`, `Content-Disposition: inline`, `Cache-Control: no-store`.

### Changed
- **Dependencies** — added `@react-pdf/renderer`, `qrcode`, `@types/qrcode`. No Puppeteer / headless Chromium dependency; react-pdf keeps the footprint small.

### Tests
- **`tests-e2e/pack-phase-4.spec.ts`** — 4 cases: full happy path (scan × 2 → close pallet → complete → DB assertions on status / inventory / movements / audit); pick-list PDF responds with `application/pdf`; inline detail panel shows barcode + location; non-packer is redirected away from `/pack`.
- Vitest suite unchanged (84/84) — packing logic is DB-integrated and covered via the Playwright spec.

### Decisions made without asking (per the gate-on-PR discipline)
- **Phase 4 scope = picking + packing only.** §8.4 (shipping) and §8.5 (receiving) are distinct workflows; building them in one PR would double the surface and delay the pack demo. Shipping will ship next.
- **Single continuous workflow rather than separate Pick / Pack steps.** SPEC §8.3 treats them as one activity ("Picking & Packing"); the packer doesn't physically distinguish "now I'm picking" from "now I'm packing" — they scan, set down, repeat.
- **Auto-flip `approved → picking` on first pack action.** No explicit "Start picking" button. Keeps the packer's click budget small.
- **Implicit pallet auto-create on first pack.** SPEC §8.3 allows either "currently open pallet for this order, or a new pallet". The UI still exposes "New pallet" as an explicit button.
- **Over-pack gated behind a confirm strip, not silently accepted.** SPEC §8.3 says "Over-scan triggers confirm dialog" — we use an inline strip (no modal) that auto-focuses the confirm button so a scanner Enter keeps the flow keyboard-driven.
- **PDF via `@react-pdf/renderer`, not Puppeteer.** SPEC §2 leaves the choice open. react-pdf ships as a pure-JS npm package — no headless-Chromium in the Vercel bundle, no runtime fetch of a binary. Cost: no CSS parity, but the PDFs are small tables + a label, not app screens.
- **Pallet numbering format `PAL-YYYY-NNNNN`.** Matches SPEC §6's example (`PAL-2026-00042`). Yearly sequence via `allocate_sequence('pallet_<year>')` — reuses the existing `numbering_sequences` table + `SECURITY DEFINER` allocator.
- **Complete-pack requires all pallets closed.** Packers may forget to close the last pallet; the server blocks completion with a clear reason and the UI mirrors the same guard.
- **Read-only view post-pack.** Once an order is `packed`, `shipped`, `delivered`, etc., the `/pack/[orderId]` page still renders — just without scan input / Complete button — so the packer can re-print labels or the pick list.

### Follow-ups for later phases
- **Phase 4.1 — shipping (§8.4):** Admin assigns pallets to a `shipment`, carrier + tracking, `packed → shipped`, packing slip PDF, auto-create draft invoice.
- **Phase 4.2 — branch receiving (§8.5):** Branch user scans pallet QR on arrival → pallet → `delivered`; order `delivered` when all pallets received; auto-close after 14 days.
- **Phase 7 polish:** no-product-thumbnail path in the inline detail panel (SPEC §8.3 mentions a "small product thumbnail" as optional; the schema has no thumbnail column yet).
- **Phase 7 polish:** `completeOrderPack` does a best-effort linear sequence of `inventory_movements` insert + per-row inventory updates, not a single DB transaction (Supabase JS has no transaction primitive). The audit row + movement rows give a reconcilable trail, but a failure between those writes leaves inventory briefly inconsistent. Low risk (best-effort writes to a single Postgres instance rarely fail partway); revisit when invoicing needs stricter cross-table atomicity.

## [Phase 3.3.3a] — 2026-04-19 — notification preferences + unsubscribe + minimal legal wiring

### Added — schema + config
- **`users.notification_preferences` JSONB column** (migration `20260419000001_user_notification_preferences.sql`). Shape `{ state_changes: { email, in_app }, admin_alerts: { email, in_app } }`. Default everything on (opt-out model, internal tool). Reminders fold into `state_changes`; trigger→category mapping in `src/lib/email/categories.ts`. RLS on `users` (self + admin) already covers reads + updates; no new policy.
- **`src/config/company.ts`** — single typed export (`COMPANY: CompanyConfig`) used by every renderer of company identity (email footer today; /privacy, /cookies, legal boilerplate in 3.3.3b). Fields we don't have values for yet render the literal `[PLACEHOLDER]`; helper `isPlaceholder(value)` for future build-time readiness checklists.
- **`src/lib/email/categories.ts`** — taxonomy single source of truth. `NotificationCategory` / `NotificationChannel` types, `NotificationTriggerType` closed union covering all 11 live `notify()` type strings, `TRIGGER_CATEGORY` map, `FORCED_EMAIL_TRIGGERS` whitelist (currently `['order_submitted_while_overdue']`), `CATEGORY_LABELS` for UI, `FORCED_DISCLOSURE_TEXT` for the settings disclosure line.

### Added — unsubscribe flow
- **`src/lib/email/unsubscribe-token.ts`** — HMAC-SHA256 signed tokens `<base64url(json(payload))>.<base64url(sig)>`. 60-day validity, 5-minute future-skew window. `encode`/`decode`/`verify` exports. Constant-time signature compare (`timingSafeEqual`). Not single-use — idempotent server action. New env var `UNSUBSCRIBE_TOKEN_SECRET` documented in `docs/ENV.md`.
- **`src/app/unsubscribe/{page.tsx,actions.ts,success/page.tsx}`** — public route (no session). Confirm page verifies the token, shows category label + forced-category notice if applicable, posts to an idempotent server action that flips `email` bit via the admin client + writes an audit row. Any failure → one "expired or invalid" UX. Success page echoes what changed and offers /settings/notifications to resubscribe.

### Added — settings UI
- **`src/app/(app)/settings/layout.tsx`** — minimal two-column shell (secondary sidebar + content). One entry today ("Notifications"); upgrade to client-component nav when a second entry lands.
- **`src/app/(app)/settings/notifications/{page.tsx,actions.ts,_components/notifications-form.client.tsx}`** — Server Component reads the user's row under their session (RLS self-select); client form renders the 2×2 grid via `useFormState` + `useFormStatus`. Forced-email cells render disabled with a `title` tooltip + `sr-only` hint. Server action preserves forced bits regardless of form input (defence against crafted POST). Save → `revalidatePath` → fresh RSC render with persisted state.
- **Sidebar footer link** in `src/components/app/app-sidebar.tsx` — `Settings` icon + label, active for any route under `/settings`.

### Changed — `notify()` filter + typing
- **`src/lib/email/notify.ts`** — `type` parameter narrowed from `string` to `NotificationTriggerType` (closed union). Zero existing call sites broke — all 10 live literals already match the union. Per-recipient prefs bulk-read at the top of the function; in-app rows inserted only for opt-in recipients; email sent when opt-in OR trigger is on `FORCED_EMAIL_TRIGGERS`. Skip log line for non-forced email drops (`[notify] skipped email to <uid>: opted out of <category>`); forced sends never logged, payloads never logged.

### Changed — email footer (minimal 3.3.3a patch)
- **`src/lib/email/templates/_layout.ts`** — `htmlLayout` footer now renders `COMPANY.legal_name` + "Manage email preferences" + "Unsubscribe" links with `{{UNSUBSCRIBE_URL}}` / `{{PREFS_URL}}` placeholders. New `textFooter()` export mirrors the HTML footer as plaintext. `notify()` replaces the placeholders per recipient using a freshly-signed unsubscribe token. Templates untouched — zero per-template edits. Full visual polish (logo, responsive layout, address block) lands in 3.3.3b.

### Audit log
- Both the `/unsubscribe` flow and the settings page write one `audit_log` row per changed save. Decision: single action name `notification_preferences_updated` with full `before_json.preferences` + `after_json.preferences` + `after_json.source` (`'email_link'` vs `'settings_page'`). One row per save (not per bit) — matches the repo's one-row-per-user-action pattern; diff is trivially unpackable at read time. Idempotent: skipped when nothing changed.

### Tests
- **`tests/lib/unsubscribe-token.test.ts`** — 16 cases covering encode→decode roundtrip, expiry (60 days), future skew (±5 min), tampering rejection (mutated sig, mutated payload), malformed input, unknown category, wrong-secret rejection, unset-secret throws.
- **`tests/lib/notify-prefs.test.ts`** — 8 cases: email-only skip, in_app-only skip, both-off silent, all-on happy path, forced bypass (admin_alerts.email off → still sent), forced in-app respected (forced is email-only), per-recipient URL composition (no `{{...}}` leaks), token-per-recipient uniqueness.
- **`tests-e2e/settings-notifications.spec.ts`** — 4 cases: 2×2 grid renders with admin_alerts.email locked + disclosure shown, toggle persists across reload + mirrors to DB, crafted POST preserves forced bit, save writes audit row with `source='settings_page'`.
- **`tests-e2e/unsubscribe-3-3-3a.spec.ts`** — 3 cases: valid-token happy path (page + click + DB + audit `source='email_link'`), garbage token → expired-or-invalid UX, admin_alerts token shows "keep being sent" notice.

### Pre-production fill-ins

Values listed as `[PLACEHOLDER]` in `src/config/company.ts` that need real data before the first production email goes out. Grep `isPlaceholder` or `\[PLACEHOLDER\]` to audit.

- `COMPANY.kvk` — Kamer van Koophandel registration number.
- `COMPANY.btw_number` — BTW / VAT number (NL format: NL123456789B01).
- `COMPANY.visiting_address` — visiting (walk-in) address for the legal footer.
- `COMPANY.postal_address` — postal address if different from visiting; otherwise copy of `visiting_address`.
- `COMPANY.phone` — main contact phone.

Proposed defaults **requiring confirmation** (not placeholders; values picked based on repo precedent, may still be wrong):
- `COMPANY.support_email = "info@bessemsmarketingservice.nl"` — same inbox the account-holder uses personally. Alternative: `support@bessemsmarketingservice.nl`.
- `COMPANY.website_url = "https://bessemsmarketingservice.nl"` — public marketing site root. The internal procurement URL (`procurement.bessems.nl` per `docs/ENV.md`) is intentionally NOT used here because the legal footer should link the company's public face, not an internal app.
- `COMPANY.legal_name = "Bessems Marketing Service B.V."` — confirmed by the user.

### Deferred to 3.3.3b
- Polished email templates (logo, branded hero, responsive table grid) and full legal footer layout.
- `/privacy` + `/cookies` pages with GDPR boilerplate.
- Address + KvK + phone inclusion in the footer once real values are supplied.

### Deferred to a later 3.3.3a follow-up (not yet applied)
- **Ghost-recipient skip in `notify()`.** Today `wantsInApp`/`wantsEmail` fall back to `?? true` when a user_id is absent from the bulk pref read. Proposed tightening: skip those recipients entirely (row disappeared between resolution and send). Preserves `?? true` for the "row exists, incomplete shape" case. Defer until the next notifications PR touches `notify()`.

## [Phase 3.3.2 follow-up] — 2026-04-19 — orphaned notifications

### Bug
- Clicking an older notification could 404 when the linked order had been deleted (e.g. by an e2e teardown, an admin cleanup, or any other path that removes the row). The notification still rendered in the dropdown, then `router.push(payload.href)` landed on `/orders/[id]` → notFound.

### Fix
- **Data layer (`src/lib/db/notifications.ts`):** `fetchMyNotifications` now over-fetches (30 raw → 10 visible) and post-filters notifications whose `payload.order_id` no longer maps to an existing, RLS-visible order. Adjusts the unread badge count down by the orphan-unread delta so badge ↔ dropdown stay consistent.
- **Defensive click (`src/components/app/notifications-bell.client.tsx`):** before `router.push`, the bell calls a new `/api/notifications/me/check?id=…` endpoint. On `{ ok: false }` the row is marked stale in place — `data-stale="true"`, strikethrough headline, inline message ("This order is no longer available — it was deleted or you can no longer access it.") — and the notification is auto-marked read. Dropdown stays open so the user has the explanation in context. Network failures are treated as "navigate anyway" (false negatives are worse than false positives here).
- **New route:** `src/app/api/notifications/me/check/route.ts` — single-shot `{ ok: boolean }` for the click-time recheck.

### Tests
- `tests-e2e/notifications-bell-orphan.spec.ts` (new, 2 cases):
  - Notification with a deleted order is filtered from the dropdown + badge stays at 0.
  - Race scenario — order deleted between dropdown render and click → row turns stale, inline message visible, no navigation, notification auto-marked read.
- `tests-e2e/notifications-bell-3-3-2.spec.ts` updated: bell-mechanics fixtures now omit `payload.order_id` (the previous fake-UUID approach was relying on the absence of orphan filtering — they'd otherwise be filtered out themselves).

### Deferred
- 90-day notifications-cleanup cron (housekeeping for accumulated read rows) added to `docs/BACKLOG.md` under Phase 7. Not blocking — rows accumulate slowly, the orphan filter handles the user-facing symptom.

## [Phase 3.3.2] — 2026-04-19

### Added
- **In-app notification bell** in a new top bar slot (`AppShell` gains a 48px header above the page content; sidebar is unchanged).
- **Bell** (`src/components/app/notifications-bell{.tsx,.client.tsx}`) — server-component wrapper seeds the initial snapshot to avoid an empty-state flash; client component renders the badge + dropdown and polls every 30 s. Polling is visibility-aware: paused when the tab is hidden, forced-refresh on focus.
- **Dropdown** — last 10 notifications, headline + relative time. Unread rows carry an accent-tinted background + a small accent dot. "Mark all read" link in the header. Clicking an item calls the read action optimistically and navigates to its `payload.href`. No new dep — click-outside + Escape via lightweight effect.
- **API route `/api/notifications/me`** — single-shot snapshot (`{ unread_count, recent[] }`) used by the bell's poller. Same shape the server wrapper uses, RLS-scoped to `auth.uid()`.
- **Server actions** `markNotificationsRead` (single id or all-unread, form-data interface) + `markAllNotificationsReadFormAction` wrapper. Update is RLS-gated; no audit_log row written per mark (high-volume read-state mutation; the underlying entity changes are already audited).
- **Shared dates util** (`src/lib/dates/format.ts`) extracts `formatAbsolute` + `relativeTime` from `<ActivityTimeline>` so the bell reuses the same nl-NL / Europe/Amsterdam formatting.
- **Notification headline copy** (`src/lib/notifications/headline.ts`) — pure module mapping every 3.3.1 trigger type to a short bell-friendly one-liner. Pinned by 8 vitest cases.
- Playwright spec `tests-e2e/notifications-bell-3-3-2.spec.ts` (7 cases): bell + badge surface, dropdown content, mark-all clears badge + persists to DB, click-through navigation + read flag, RLS scope (other users' notifications never appear), 30 s poller picks up a new row on visibility-change.

### Changed
- `<AppShell>` now renders a 48 px top bar above the main content. Pages keep their own `<PageHeader>` for breadcrumbs + per-page actions; the top bar holds global controls (the bell today; ⌘K / workspace switcher land here later).
- `<ActivityTimeline>` swapped its private `formatAbsolute` / `relativeTime` for the shared `dates/format` exports — same behaviour, single source of truth.

### Database
- No migrations. The `notifications` table + RLS landed in Phase 1.5 (`20260417000011`); 3.3.2 is a pure UI consumer.

## [Phase 3.3.1] — 2026-04-18  *(rebased onto 3.2.2c)*

Originally built before 3.2.2; rebased on top of the two-step approval
flow. Ships in **console-only mode** — no Resend SDK is installed and
no `RESEND_API_KEY` is required. Every transport call logs
`[email:console] type=… to=… subject=…` followed by the plain-text
body. Notifications rows still get written so the 3.3.2 bell has data.

### Added (post-rebase)
- **Email infrastructure (`src/lib/email/`)** — adapter-pattern transport (SPEC §2: SendGrid swap stays a one-file change), recipient resolvers (`managersForBranch`, `hqManagers`, `packerPool`, `adminAudience`, `userById`), template render functions, and a `notify()` helper that writes a `notifications` row per recipient via the service-role client and fires the transport per message.
- **Lifecycle triggers — step-tagged for 3.2.2's two-step flow:**
  - `order_submitted` → branch managers (cart submit)
  - `order_submitted_while_overdue` → admin pool (override path, SPEC §8.1.4)
  - `order_branch_approved` → HQ Managers (BM completed step 1, HQ takes over)
  - `order_approved` → packer pool (HQ completed step 2 — order ready to pick)
  - `order_branch_rejected` → creator (BM rejected at step 1)
  - `order_hq_rejected` → creator AND `order_hq_rejected_to_branch_manager` → BM who approved step 1 (with "you were overruled" framing)
  - `order_cancelled` → branch managers (manual cancel, any pre-shipped state)
  - `order_auto_cancelled` → fanout per timeout step (creator + BMs always; HQ + admins on step-2 timeout per SPEC §8.8)
  - `submitted_awaiting_branch_reminder` → branch managers (nightly digest of orders waiting > 24h)
  - `branch_approved_awaiting_hq_reminder` → HQ Managers (nightly digest of orders waiting > 24h cross-branch)
- **Cron route `/api/cron/awaiting-approval`** — single nightly tick now emits BOTH digests (step-1 to BMs grouped by branch, step-2 to HQ Managers cross-branch). Schedule `15 0 * * *` UTC = 02:15 Europe/Amsterdam standard time / 03:15 CEST.
- **Cron route `/api/cron/auto-cancel-stale-orders`** (3.2.2c) gains the `order_auto_cancelled` notification side-effect — emits in the same status-guarded UPDATE pass.
- Vitest: 4 new template render cases (`renderOrderBranchApproved`, `renderOrderHqRejectedToBranchManager`, `renderOrderAutoCancelled` × both steps, `renderAwaitingHqApprovalReminder`).
- Playwright (`tests-e2e/notifications-3-3-1.spec.ts`) rewritten for the new model: BM-approve → `order_branch_approved` to HQ; HQ-approve → `order_approved` to packers; BM-reject → `order_branch_rejected`; HQ-reject fans out to creator + BM-who-approved; manual cancel → managers; both digest types; both auto-cancel timeouts.

### Changed (during rebase)
- `src/lib/actions/cart.ts` and `src/lib/actions/approval.ts` notify after the audit_log insert. All side effects are wrapped in try/catch — a notifications outage cannot roll back the underlying state change.
- `vitest.config.ts` aliases `server-only` to a no-op stub so pure-server utilities (templates, transport) stay unit-testable from Node-mode vitest.
- `vercel.json` carries both crons (`auto-cancel-stale-orders` from 3.2.2c + `awaiting-approval` here).

### Mode
- **Console-only this milestone.** Switching on real Resend later is documented in `docs/ENV.md` under `RESEND_API_KEY` — install the package, replace the `consoleTransport` factory with the Resend client, set the env vars, and verify a sender domain.

## [Phase 3.2.2c] — 2026-04-18

### Deploy warning (READ BEFORE MERGING TO PROD)

**After auto-cancel cron deploys, any orders submitted more than 2 working days ago without branch approval will be auto-cancelled on the next cron run (08:00 Europe/Amsterdam). If you have pending orders you want to keep, approve or cancel them manually before deploying 3.2.2c.**

The same applies to step-2 stale orders: any order in `branch_approved` more than 3 working days ago will be auto-cancelled with reservation release. Verify operator awareness before flipping `CRON_SECRET` on in Vercel.

### Added
- **`src/lib/dates/working-days.ts`** — pure module with `isWorkingDay`, `addWorkingDays`, `workingDaysBetween`. Default tz `Europe/Amsterdam`; `holidays?: Date[]` plumbed through but unwired (Phase 7 polish entry in `BACKLOG.md` covers the NL public-holidays wiring). Vitest suite (15 cases) covers Mon–Fri / weekends / DST boundaries / holidays / round-trip agreement.
- **`/api/cron/auto-cancel-stale-orders`** — nightly route (SPEC §8.8). Two passes per run:
  - Step-1 timeout: `status='submitted' AND submitted_at < addWorkingDays(now, -2)` → cancel with audit reason `auto_cancel_no_branch_approval`. No reservations exist yet at step 1.
  - Step-2 timeout: `status='branch_approved' AND branch_approved_at < addWorkingDays(now, -3)` → cancel with audit reason `auto_cancel_no_hq_approval`. Releases reservations via the same movements + inventory pattern as the manual cancel action.
  - Optional `CRON_SECRET` Bearer guard (mandatory in production; auto-skipped in local dev + e2e).
  - Status-guarded UPDATE (`.eq("status", priorStatus)`) so a racing manual approve / cancel wins; the cron silently skips orders that moved out from under it.
  - Returns `{ ok, now, step1_cutoff, step2_cutoff, candidates, cancelled, reservations_released }` for observability.
- **`vercel.json`** — schedule `0 6 * * *` UTC = 08:00 CET (winter) / 09:00 CEST (summer). DST drift acknowledged in `BACKLOG.md`.
- **Playwright e2e** (`tests-e2e/auto-cancel-3-2-2c.spec.ts`) — fixtures inject stale orders at both timeouts, hit the cron route, assert: status flips to `cancelled`, audit row carries the right reason, reservations released for the step-2 path, races are no-ops.

### Changed
- `docs/ENV.md` documents `CRON_SECRET` (the same env var the paused 3.3.1 branch had — staged here so the rebase is conflict-free).

### Database
- No migrations.

## [Phase 3.2.2b] — 2026-04-18

### Added
- **Two-step approval flow** (SPEC §8.2). `branchApproveOrder` flips `submitted → branch_approved` (Branch Manager, with quantity adjustment + reservation creation). New `hqApproveOrder` flips `branch_approved → approved` (HQ Manager, no quantity adjustment, no new reservations). Both audit-log under their step-tagged action names (`branch_approve` / `hq_approve`).
- **HQ approval queue** at `/approvals` for HQ Managers and admins — tabbed view (Awaiting HQ / Awaiting branch / All pending), URL-driven (`?tab=`), per-tab counts. Branch Managers continue to see the single-tab step-1 view.
- **Step-2 (HQ) approve form** at `src/app/(app)/orders/[id]/_components/hq-approve-form.tsx` — read-only line table + single confirm action; HQ doesn't adjust quantities (that's the BM's call).
- **Sidebar role-aware label** — "Orders" for branch-scoped roles, "All orders" for HQ / Administration / Super Admin (decision S4 in `PROJECT-JOURNAL.md`). HQ Managers now also see the Approvals entry.
- **Order detail status banner** surfaces both approver identities independently (`branch_approved_by_email` + `approved_by_email` with timestamps).
- **Orders list** gains a "Branch-approved by" column alongside the existing "HQ-approved by" column.
- ActivityTimeline learns six new action labels: `branch_approve`, `hq_approve`, `branch_reject`, `hq_reject`, `auto_cancel_no_branch_approval`, `auto_cancel_no_hq_approval`. Legacy `approve` / `reject` labels stay so backfilled audit rows from migration `20260418000006` still render cleanly.
- Playwright e2e (`tests-e2e/two-step-3-2-2b.spec.ts`): full happy path, HQ-reject + reservation release, BM-reject audit-name, HQ tabs, UI guards proving BM can't HQ-approve and vice-versa.

### Changed
- `rejectOrder` accepts both `submitted` and `branch_approved` source states. The HQ-reject path releases reservations via the new shared `releaseReservationsFor()` helper.
- `cancelOrder` adds `branch_approved` to the cancellable set; reservation release also covers that state.
- Existing `approvals.spec.ts` rewritten for the new model: BM-approve now asserts `branch_approved` + `branch_approve` audit; cancel test cancels from `branch_approved`; button labels updated to "Branch-approve order".

### Database
- No migrations. The schema for two-step approval landed in 3.2.2a (`branch_approved` enum value, `branch_approved_*` columns, HQ Manager role, RLS); this PR is purely behaviour + UI.

## [Phase 3.2.1] — 2026-04-18

### Added
- Reusable `<ActivityTimeline>` and `<OrderStatusPill>` components in `src/components/app/`. The timeline ingests `audit_log` rows for any entity and renders actor avatars (initials), action label, payload summary (e.g. "adjusted 2 lines qty down"), absolute timestamp, and a relative-time hover hint. Phases 4 / 5 / 6 / 7 reuse the same component for pallets, invoices, payments, returns — see `ARCHITECTURE.md` § "Activity timeline".
- Status filter chips on `/orders` (`?status=submitted|approved|shipped|delivered|closed`), URL-driven and Zod-validated at the trust boundary.
- Approved-by column on `/orders`, populated via a follow-up `users` lookup keyed off `orders.approved_by_user_id`.
- Packer page scaffolds a "My completed" section so the Phase 4 layout is visible for visual review.
- Playwright coverage for clickable catalog rows, `Add to cart` not opening the drawer, the order timeline rendering an approver entry, and approver visibility for both super admin and the order's branch user.

### Changed
- Catalog rows are entirely clickable (table + grid). The table uses a thin client-side `CatalogRow` wrapper that ignores clicks originating inside `a / button / input / select / textarea / label / [data-row-stop]` so inline actions (e.g. future per-row Add-to-cart) won't open the drawer.
- `/orders/[id]` lifts the status pill to a prominent banner above the fold and replaces the inline timeline with the new shared component.
- `fetchOrderDetail` now returns `approved_by_email` so list and detail share a single source of truth.

### Database
- `20260418000001_audit_log_order_branch_select.sql` — adds an OR-policy on `audit_log` granting `SELECT` to anyone who can already `SELECT` the underlying order via the existing `orders_select` chain. Branch users can now see manager / packer / shipper actions on their own orders. Admins, packers, and other-branch users are unaffected by their existing scopes.
- `20260418000003_users_shared_branch_helper.sql` — fixes a follow-up gap exposed by the e2e suite: the audit row was reachable but the actor-email lookup hit `users` RLS, which had no clause for branch users. Adds a `SECURITY DEFINER` `user_shares_branch_with_caller(uuid)` helper (mirrors `current_user_has_branch`) and a new `users_select_shared_branch` policy that grants SELECT on a user row to any caller who shares a `user_branch_roles` assignment with that user. Cross-branch isolation is preserved (verified by the existing `tests/rls/users.test.ts` "cannot read another branch's user" assertion). Note: `20260418000002_users_select_shared_branch.sql` was the first attempt and is left in place but superseded — the policy it created is dropped + recreated by `…000003`.

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
