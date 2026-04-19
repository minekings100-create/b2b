/**
 * Friendly one-liner per notification type, used by the 3.3.2 bell
 * dropdown. Pure module — no DB, no `server-only` — so the vitest
 * suite can pin the copy table without touching the data layer.
 *
 * Same `payload` shape as the 3.3.1 email templates emit. Adding a
 * new trigger? Add a `case` here AND a render function in
 * `src/lib/email/templates/index.ts` — they're peers.
 */

export function describeNotification(
  type: string,
  payload: Record<string, unknown>,
): string {
  const num =
    typeof payload.order_number === "string" ? payload.order_number : "";
  const branch =
    typeof payload.branch_code === "string" ? payload.branch_code : "";
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  switch (type) {
    case "order_submitted":
      return `New order ${num} from ${branch} awaiting branch approval`;
    case "order_submitted_while_overdue":
      return `Override: ${num} submitted by ${branch} despite overdue invoices`;
    case "order_branch_approved":
      return `Order ${num} branch-approved — awaiting your HQ decision`;
    case "order_approved":
      return `Order ${num} HQ-approved — ready to pick`;
    case "order_branch_rejected":
      return `Order ${num} rejected by branch${reason ? ` — ${truncate(reason, 60)}` : ""}`;
    case "order_hq_rejected":
      return `Order ${num} rejected by HQ${reason ? ` — ${truncate(reason, 60)}` : ""}`;
    case "order_hq_rejected_to_branch_manager":
      return `HQ overruled your branch approval — ${num}`;
    case "order_cancelled":
      return `Order ${num} was cancelled`;
    case "order_auto_cancelled":
      return `Order ${num} auto-cancelled (timeout)`;
    case "order_edited":
      return `Order ${num} was edited — needs your re-approval`;
    case "invoice_issued": {
      const inv =
        typeof payload.invoice_number === "string"
          ? payload.invoice_number
          : "";
      return `Invoice ${inv} issued to your branch`;
    }
    case "invoice_overdue_reminder": {
      const inv =
        typeof payload.invoice_number === "string"
          ? payload.invoice_number
          : "";
      const days =
        typeof payload.days_overdue === "number" ? payload.days_overdue : 0;
      return `Reminder: invoice ${inv} is ${days} days overdue`;
    }
    case "submitted_awaiting_branch_reminder":
      return `Reminder: orders awaiting your branch approval`;
    case "branch_approved_awaiting_hq_reminder":
      return `Reminder: orders awaiting HQ approval`;
    default:
      return type.replace(/_/g, " ");
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
