# Changelog

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
