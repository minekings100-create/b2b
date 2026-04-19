import "server-only";

import { appBaseUrl } from "../transport";
import { escape, htmlLayout } from "./_layout";

/**
 * Render functions, one per notification type. Pure: take a typed payload,
 * return `{ subject, html, text }`. No DB access, no env reads beyond the
 * shared `appBaseUrl()` for CTA URLs. This keeps templates trivially
 * unit-testable and lets 3.3.3 swap the layout without touching call sites.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type OrderSummary = {
  order_number: string;
  branch_code: string;
  branch_name: string;
  total_gross_cents: number;
  item_count: number;
};

function eur(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function orderUrl(orderId: string): string {
  return `${appBaseUrl()}/orders/${orderId}`;
}

// ---------------------------------------------------------------------------
// order_submitted — to: branch managers
// ---------------------------------------------------------------------------

export function renderOrderSubmitted(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  submitter_email: string;
  total_gross_cents: number;
  item_count: number;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `New order ${input.order_number} from ${input.branch_code} awaiting approval`;
  const text = [
    `New order awaiting your approval.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Submitted by: ${input.submitter_email}`,
    `Lines: ${input.item_count}`,
    `Total: ${eur(input.total_gross_cents)}`,
    ``,
    `Review: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} awaiting approval`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">New order awaiting your approval</p>
      <p style="margin:0 0 12px;">A new order has been submitted and needs a manager decision.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:120px;">Number</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch</td><td style="padding:4px 0;">${escape(input.branch_code)} · ${escape(input.branch_name)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Submitted by</td><td style="padding:4px 0;">${escape(input.submitter_email)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Lines</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${input.item_count}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Total</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(eur(input.total_gross_cents))}</td></tr>
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "Review order →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_submitted_while_overdue — to: administration + super_admin
// ---------------------------------------------------------------------------

export function renderOrderSubmittedWhileOverdue(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  submitter_email: string;
  outstanding_count: number;
  outstanding_total_cents: number;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `[Override] ${input.order_number} submitted by ${input.branch_code} despite ${input.outstanding_count} overdue invoice(s)`;
  const text = [
    `Branch ${input.branch_code} (${input.branch_name}) submitted a new order while ${input.outstanding_count} invoice(s) are still overdue.`,
    ``,
    `Order: ${input.order_number}`,
    `Submitter: ${input.submitter_email}`,
    `Outstanding: ${input.outstanding_count} · ${eur(input.outstanding_total_cents)}`,
    ``,
    `Review: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `${input.branch_code} submitted while overdue`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#b45309;">Override: order submitted while branch has overdue invoices</p>
      <p style="margin:0 0 12px;">${escape(input.branch_code)} (${escape(input.branch_name)}) submitted a new order despite the outstanding-invoice gate.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:140px;">Order</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Submitter</td><td style="padding:4px 0;">${escape(input.submitter_email)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Outstanding</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${input.outstanding_count} · ${escape(eur(input.outstanding_total_cents))}</td></tr>
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "Open order →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_approved — to: packer pool
// ---------------------------------------------------------------------------

export function renderOrderApproved(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  approver_email: string;
  item_count: number;
  has_backorder: boolean;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const flag = input.has_backorder ? " (backorder flagged)" : "";
  const subject = `Order ${input.order_number} approved — ready to pick${flag}`;
  const text = [
    `An order is approved and ready to pick.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Approved by: ${input.approver_email}`,
    `Lines: ${input.item_count}${input.has_backorder ? "  (backorder)" : ""}`,
    ``,
    `Open: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} ready to pick`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Order approved — ready to pick</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:120px;">Number</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch</td><td style="padding:4px 0;">${escape(input.branch_code)} · ${escape(input.branch_name)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Approved by</td><td style="padding:4px 0;">${escape(input.approver_email)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Lines</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${input.item_count}${input.has_backorder ? " · backorder" : ""}</td></tr>
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "Open order →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_rejected — to: branch user (creator)
// ---------------------------------------------------------------------------

export function renderOrderRejected(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  reason: string;
  rejecter_email: string;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `Order ${input.order_number} rejected`;
  const text = [
    `Your order was rejected.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code}`,
    `Decision by: ${input.rejecter_email}`,
    ``,
    `Reason:`,
    input.reason,
    ``,
    `Details: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} rejected`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#b91c1c;">Order rejected</p>
      <p style="margin:0 0 12px;">Order <strong style="font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</strong> for branch ${escape(input.branch_code)} was rejected by ${escape(input.rejecter_email)}.</p>
      <p style="margin:12px 0 4px;color:#71717a;">Reason</p>
      <blockquote style="margin:0 0 12px;padding:12px 16px;background:#fef2f2;border-left:3px solid #b91c1c;color:#7f1d1d;">${escape(input.reason)}</blockquote>
    `,
    ctaUrl: url,
    ctaLabel: "View order →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_cancelled — to: branch managers (notify of cancellation after approve)
// ---------------------------------------------------------------------------

export function renderOrderCancelled(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  prior_status: string;
  canceller_email: string;
  reason: string | null;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `Order ${input.order_number} cancelled (was ${input.prior_status})`;
  const text = [
    `An order was cancelled.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Was: ${input.prior_status}`,
    `Cancelled by: ${input.canceller_email}`,
    input.reason ? `Reason: ${input.reason}` : "Reason: (none)",
    ``,
    `Details: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} cancelled`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Order cancelled</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:140px;">Number</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch</td><td style="padding:4px 0;">${escape(input.branch_code)} · ${escape(input.branch_name)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Was</td><td style="padding:4px 0;">${escape(input.prior_status)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Cancelled by</td><td style="padding:4px 0;">${escape(input.canceller_email)}</td></tr>
        ${input.reason ? `<tr><td style="padding:4px 0;color:#71717a;">Reason</td><td style="padding:4px 0;">${escape(input.reason)}</td></tr>` : ""}
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "View order →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_awaiting_approval_reminder — digest, to: each manager once
// ---------------------------------------------------------------------------

export function renderAwaitingApprovalReminder(input: {
  branch_code: string;
  branch_name: string;
  manager_email: string;
  orders: Array<{
    order_id: string;
    order_number: string;
    submitted_at: string;
    item_count: number;
    total_gross_cents: number;
  }>;
}): RenderedEmail {
  const subject = `${input.orders.length} order${input.orders.length === 1 ? "" : "s"} awaiting your approval (${input.branch_code})`;
  const lines = input.orders
    .map(
      (o) =>
        `  · ${o.order_number} — ${o.item_count} line${o.item_count === 1 ? "" : "s"} · ${eur(o.total_gross_cents)} · submitted ${new Date(o.submitted_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`,
    )
    .join("\n");
  const text = [
    `You have ${input.orders.length} order${input.orders.length === 1 ? "" : "s"} awaiting approval for ${input.branch_code} (${input.branch_name}):`,
    ``,
    lines,
    ``,
    `Approval queue: ${appBaseUrl()}/approvals`,
  ].join("\n");
  const rowsHtml = input.orders
    .map(
      (o) =>
        `<tr>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;"><a href="${escape(orderUrl(o.order_id))}" style="color:#4f46e5;text-decoration:none;">${escape(o.order_number)}</a></td>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;text-align:right;">${o.item_count}</td>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;text-align:right;">${escape(eur(o.total_gross_cents))}</td>
          <td style="padding:6px 0;color:#71717a;text-align:right;">${escape(new Date(o.submitted_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }))}</td>
        </tr>`,
    )
    .join("");
  const html = htmlLayout({
    preheader: `${input.orders.length} order(s) waiting > 24h`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Reminder: orders awaiting your approval</p>
      <p style="margin:0 0 12px;">${input.orders.length} order${input.orders.length === 1 ? " has" : "s have"} been waiting more than 24 hours for branch <strong>${escape(input.branch_code)}</strong> (${escape(input.branch_name)}).</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <thead>
          <tr style="border-bottom:1px solid #e4e4e7;">
            <th style="text-align:left;padding:6px 0;color:#71717a;font-weight:500;">Number</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Lines</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Total</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Submitted</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `,
    ctaUrl: `${appBaseUrl()}/approvals`,
    ctaLabel: "Open approval queue →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 3.2.2-aware additions (post-rebase) — step-tagged templates
// ---------------------------------------------------------------------------

/**
 * order_branch_approved — step 1 done, step 2 awaiting.
 * To: HQ Managers (cross-branch).
 */
export function renderOrderBranchApproved(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  branch_approver_email: string;
  item_count: number;
  total_gross_cents: number;
  has_backorder: boolean;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const flag = input.has_backorder ? " (backorder flagged)" : "";
  const subject = `Order ${input.order_number} branch-approved by ${input.branch_code} — awaiting HQ${flag}`;
  const text = [
    `An order has cleared step-1 (branch) approval and now awaits HQ.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Branch-approved by: ${input.branch_approver_email}`,
    `Lines: ${input.item_count}${input.has_backorder ? "  (backorder)" : ""}`,
    `Total: ${eur(input.total_gross_cents)}`,
    ``,
    `Review: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} awaiting HQ approval`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Awaiting your HQ approval</p>
      <p style="margin:0 0 12px;">An order cleared the branch's step-1 review and is now in the HQ queue.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:140px;">Number</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch</td><td style="padding:4px 0;">${escape(input.branch_code)} · ${escape(input.branch_name)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch-approved by</td><td style="padding:4px 0;">${escape(input.branch_approver_email)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Lines</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${input.item_count}${input.has_backorder ? " · backorder" : ""}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Total</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(eur(input.total_gross_cents))}</td></tr>
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "Review order →",
  });
  return { subject, html, text };
}

/**
 * order_hq_rejected_to_branch_manager — informs the BM who approved at
 * step 1 that HQ vetoed their decision. Different framing from the
 * creator-facing copy: focuses on the BM's prior approval being
 * overruled. Creator gets the same `renderOrderRejected` as before.
 */
export function renderOrderHqRejectedToBranchManager(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  reason: string;
  rejecter_email: string;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `HQ overruled your branch approval — order ${input.order_number}`;
  const text = [
    `HQ rejected an order you approved at step 1.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code}`,
    `HQ decision by: ${input.rejecter_email}`,
    ``,
    `HQ reason:`,
    input.reason,
    ``,
    `If the order should still happen, the branch user can resubmit with adjustments.`,
    ``,
    `Details: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `HQ overruled order ${input.order_number}`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#b91c1c;">HQ overruled your branch approval</p>
      <p style="margin:0 0 12px;">Order <strong style="font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</strong> for branch ${escape(input.branch_code)} was rejected at step 2 by ${escape(input.rejecter_email)}.</p>
      <p style="margin:12px 0 4px;color:#71717a;">HQ reason</p>
      <blockquote style="margin:0 0 12px;padding:12px 16px;background:#fef2f2;border-left:3px solid #b91c1c;color:#7f1d1d;">${escape(input.reason)}</blockquote>
      <p style="margin:0 0 12px;color:#71717a;font-size:12px;">If the order should still happen, the branch user can resubmit with adjustments.</p>
    `,
    ctaUrl: url,
    ctaLabel: "View order →",
  });
  return { subject, html, text };
}

/**
 * order_auto_cancelled — single template covers both step-1 and step-2
 * timeouts. Caller passes `step` so the subject + body framing match
 * the underlying audit reason (`auto_cancel_no_branch_approval` or
 * `auto_cancel_no_hq_approval`).
 */
export function renderOrderAutoCancelled(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  step: "branch" | "hq";
  waited_days: number;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const stepLabel =
    input.step === "branch" ? "branch approval" : "HQ approval";
  const subject = `Auto-cancelled: order ${input.order_number} timed out waiting for ${stepLabel}`;
  const text = [
    `An order was auto-cancelled because it sat in the ${stepLabel} queue for more than ${input.waited_days} working days.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Stage that timed out: ${stepLabel}`,
    ``,
    input.step === "branch"
      ? `Reservations: none were created (step 1 hadn't completed).`
      : `Reservations: released back to inventory.`,
    ``,
    `Details: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} auto-cancelled (${stepLabel} timeout)`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#b91c1c;">Auto-cancelled — ${escape(stepLabel)} timeout</p>
      <p style="margin:0 0 12px;">Order <strong style="font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</strong> for branch ${escape(input.branch_code)} (${escape(input.branch_name)}) sat in the ${escape(stepLabel)} queue for more than ${input.waited_days} working days and was auto-cancelled by the nightly cron.</p>
      <p style="margin:0 0 12px;color:#71717a;">${
        input.step === "branch"
          ? "No reservations existed yet — step 1 hadn't completed."
          : "Reservations have been released back to inventory."
      }</p>
      <p style="margin:0 0 12px;color:#71717a;font-size:12px;">If the order should still happen, the branch user can resubmit.</p>
    `,
    ctaUrl: url,
    ctaLabel: "View order →",
  });
  return { subject, html, text };
}

/**
 * branch_approved_awaiting_hq_reminder — sibling of
 * `renderAwaitingApprovalReminder` keyed off `branch_approved_at`
 * instead of `submitted_at`. Recipients: HQ Managers.
 */
export function renderAwaitingHqApprovalReminder(input: {
  manager_email: string;
  orders: Array<{
    order_id: string;
    order_number: string;
    branch_code: string;
    branch_approved_at: string;
    item_count: number;
    total_gross_cents: number;
  }>;
}): RenderedEmail {
  const subject = `${input.orders.length} order${input.orders.length === 1 ? "" : "s"} awaiting HQ approval`;
  const lines = input.orders
    .map(
      (o) =>
        `  · ${o.order_number} — ${o.branch_code} · ${o.item_count} line${o.item_count === 1 ? "" : "s"} · ${eur(o.total_gross_cents)} · branch-approved ${new Date(o.branch_approved_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`,
    )
    .join("\n");
  const text = [
    `You have ${input.orders.length} order${input.orders.length === 1 ? "" : "s"} awaiting your HQ approval (cross-branch):`,
    ``,
    lines,
    ``,
    `HQ queue: ${appBaseUrl()}/approvals`,
  ].join("\n");
  const rowsHtml = input.orders
    .map(
      (o) =>
        `<tr>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;"><a href="${escape(orderUrl(o.order_id))}" style="color:#4f46e5;text-decoration:none;">${escape(o.order_number)}</a></td>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(o.branch_code)}</td>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;text-align:right;">${o.item_count}</td>
          <td style="padding:6px 0;font-family:'Geist Mono',ui-monospace,monospace;text-align:right;">${escape(eur(o.total_gross_cents))}</td>
          <td style="padding:6px 0;color:#71717a;text-align:right;">${escape(new Date(o.branch_approved_at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }))}</td>
        </tr>`,
    )
    .join("");
  const html = htmlLayout({
    preheader: `${input.orders.length} order(s) awaiting HQ approval`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Awaiting your HQ approval</p>
      <p style="margin:0 0 12px;">${input.orders.length} order${input.orders.length === 1 ? " has" : "s have"} cleared branch approval and is awaiting your sign-off.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <thead>
          <tr style="border-bottom:1px solid #e4e4e7;">
            <th style="text-align:left;padding:6px 0;color:#71717a;font-weight:500;">Number</th>
            <th style="text-align:left;padding:6px 0;color:#71717a;font-weight:500;">Branch</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Lines</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Total</th>
            <th style="text-align:right;padding:6px 0;color:#71717a;font-weight:500;">Branch-approved</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `,
    ctaUrl: `${appBaseUrl()}/approvals`,
    ctaLabel: "Open HQ queue →",
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// order_edited — to: branch managers (needs re-approval after edit)
// ---------------------------------------------------------------------------

export function renderOrderEdited(input: {
  order_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  editor_email: string;
  line_delta: number;
  total_delta_cents: number;
}): RenderedEmail {
  const url = orderUrl(input.order_id);
  const subject = `Order ${input.order_number} was edited — needs re-approval`;
  const deltaLineText =
    input.line_delta === 0
      ? "no line changes"
      : `${input.line_delta > 0 ? "+" : ""}${input.line_delta} line${
          Math.abs(input.line_delta) === 1 ? "" : "s"
        }`;
  const deltaTotalText =
    input.total_delta_cents === 0
      ? "no total change"
      : `${input.total_delta_cents > 0 ? "+" : ""}${eur(
          input.total_delta_cents,
        )} total`;
  const text = [
    `An order was edited and needs your re-approval.`,
    ``,
    `Number: ${input.order_number}`,
    `Branch: ${input.branch_code} (${input.branch_name})`,
    `Edited by: ${input.editor_email}`,
    `Summary: ${deltaLineText} · ${deltaTotalText}`,
    ``,
    `Review: ${url}`,
  ].join("\n");
  const html = htmlLayout({
    preheader: `Order ${input.order_number} was edited`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Order edited — re-approval needed</p>
      <p style="margin:0 0 12px;">An order on your branch was edited and has moved back to your queue.</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr><td style="padding:4px 0;color:#71717a;width:120px;">Number</td><td style="padding:4px 0;font-family:'Geist Mono',ui-monospace,monospace;">${escape(input.order_number)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Branch</td><td style="padding:4px 0;">${escape(input.branch_code)} · ${escape(input.branch_name)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Edited by</td><td style="padding:4px 0;">${escape(input.editor_email)}</td></tr>
        <tr><td style="padding:4px 0;color:#71717a;">Change</td><td style="padding:4px 0;">${escape(deltaLineText)} · ${escape(deltaTotalText)}</td></tr>
      </table>
    `,
    ctaUrl: url,
    ctaLabel: "Review order →",
  });
  return { subject, html, text };
}
