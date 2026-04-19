/**
 * 3.3.3a — single source of truth for the notification taxonomy.
 *
 * This file defines:
 *   1. The two user-visible categories in /settings/notifications.
 *   2. The forced-email whitelist (compliance signals that bypass the
 *      user's email preference).
 *   3. The trigger→category map. Every `notify()` call's `type` string
 *      is accounted for here.
 *
 * Keep in sync with every new `notify()` call site. `NotificationTriggerType`
 * is a closed union so TypeScript will error if a caller passes a string
 * that isn't listed — provided the caller is typed against it. `notify()`
 * (step 6 of 3.3.3a) narrows its `type` argument to this union so the
 * compiler catches drift.
 *
 * NOT marked "server-only": the settings UI needs `CATEGORY_LABELS` from
 * both server and client components. No secrets live here — just constants.
 */

export type NotificationCategory = "state_changes" | "admin_alerts";
export type NotificationChannel = "email" | "in_app";

/**
 * Every concrete trigger type used in a `notify()` call. New triggers MUST
 * be added here AND to `TRIGGER_CATEGORY` below. Grep for `type:` under
 * src/lib/email and src/lib/actions + src/app/api/cron to audit call sites.
 */
export type NotificationTriggerType =
  | "order_submitted"
  | "order_submitted_while_overdue"
  | "order_branch_approved"
  | "order_approved"
  | "order_branch_rejected"
  | "order_hq_rejected"
  | "order_hq_rejected_to_branch_manager"
  | "order_cancelled"
  | "order_auto_cancelled"
  | "order_edited"
  | "invoice_issued"
  | "invoice_overdue_reminder"
  | "submitted_awaiting_branch_reminder"
  | "branch_approved_awaiting_hq_reminder";

/**
 * Trigger → category. Reminders fold into `state_changes` because they
 * share the same audience (BM / HQM) and semantic thread ("your approval
 * queue still has stuff"). A user who silences state-change emails
 * implicitly silences the matching reminder, which is the right default.
 *
 * Admin compliance alerts (currently one trigger) go to `admin_alerts`.
 */
export const TRIGGER_CATEGORY: Record<
  NotificationTriggerType,
  NotificationCategory
> = {
  order_submitted: "state_changes",
  order_submitted_while_overdue: "admin_alerts",
  order_branch_approved: "state_changes",
  order_approved: "state_changes",
  order_branch_rejected: "state_changes",
  order_hq_rejected: "state_changes",
  order_hq_rejected_to_branch_manager: "state_changes",
  order_cancelled: "state_changes",
  order_auto_cancelled: "state_changes",
  order_edited: "state_changes",
  invoice_issued: "state_changes",
  invoice_overdue_reminder: "state_changes",
  submitted_awaiting_branch_reminder: "state_changes",
  branch_approved_awaiting_hq_reminder: "state_changes",
};

/**
 * Forced-email whitelist — trigger types that bypass the user's email
 * preference. Reserved for financial / compliance signals where inaction
 * causes real harm (e.g. administration must see a branch submitting
 * orders while it has overdue invoices, in real time).
 *
 * EXPANDING THIS LIST IS A ONE-WAY RATCHET. Adding a trigger here
 * silently overrides user preference for every existing account — users
 * who opted out of the matching category will start receiving email
 * again without any consent step. The bar for inclusion is: inaction on
 * this email causes financial or compliance damage, not just operational
 * inconvenience.
 *
 * The in-app channel for the same trigger is NOT forced — this whitelist
 * only overrides the `email` channel. Users who silence their bell for
 * that category still won't see an in-app toast, but they still get the
 * email because the company needs a durable record that it was sent.
 */
export const FORCED_EMAIL_TRIGGERS: readonly NotificationTriggerType[] = [
  "order_submitted_while_overdue",
];

/**
 * User-facing strings for /settings/notifications. Keep English-only for
 * now; the i18n-ready structure mentioned in SPEC §3 lands alongside
 * the rest of the copy when we wire next-intl in Phase 7.
 */
export const CATEGORY_LABELS: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  state_changes: {
    label: "Order updates",
    description:
      "Submissions, approvals, rejections, cancellations, and reminders about orders waiting in your approval queue.",
  },
  admin_alerts: {
    label: "Admin compliance alerts",
    description:
      "Financial and compliance signals for administrators — e.g. a branch submitting orders while it has overdue invoices.",
  },
};

/**
 * Static disclosure line rendered alongside any category that contains
 * at least one trigger in `FORCED_EMAIL_TRIGGERS`. The settings UI renders
 * this string unmodified so the user sees exactly what's forced and why.
 */
export const FORCED_DISCLOSURE_TEXT =
  "Some critical alerts cannot be disabled. They are sent to maintain financial and operational integrity.";
