import { cn } from "@/lib/utils";
import { formatAbsolute, relativeTime } from "@/lib/dates/format";
import type { Json } from "@/lib/supabase/types";

/**
 * Reusable activity timeline. Sub-milestone 3.2.1 introduces it for orders;
 * Phases 4 (pallets/shipments), 5 (invoices) and 6 (returns/payments) reuse
 * the same component — see /docs/ARCHITECTURE.md §"Activity timeline".
 *
 * Server component: emits relative-time hints via `<time title>` so the
 * absolute timestamp is shown by default and the relative form appears on
 * hover. Avoids a client component just to render a tooltip.
 */

export type TimelineEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  after_json: Json | null;
};

export function ActivityTimeline({
  entries,
  emptyHint = "No activity yet.",
  className,
}: {
  entries: readonly TimelineEntry[];
  emptyHint?: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-fg-muted">{emptyHint}</p>;
  }
  return (
    <ol
      data-testid="activity-timeline"
      className={cn("space-y-0", className)}
    >
      {entries.map((e, idx) => {
        const isLast = idx === entries.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Vertical guide line — hidden on the last row. */}
            {isLast ? null : (
              <span
                aria-hidden
                className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
              />
            )}
            <ActorAvatar email={e.actor_email} />
            <div className="flex-1 pt-0.5 text-sm">
              <p className="text-fg">
                <span className="font-medium">{describeAction(e.action)}</span>
                {e.actor_email ? (
                  <>
                    {" "}
                    <span className="text-fg-muted">by</span>{" "}
                    <span className="text-fg-muted">{e.actor_email}</span>
                  </>
                ) : (
                  <span className="text-fg-muted"> · system</span>
                )}
                {summarisePayload(e.action, e.after_json) ? (
                  <span className="text-fg-muted">
                    {" "}
                    ({summarisePayload(e.action, e.after_json)})
                  </span>
                ) : null}
              </p>
              <time
                dateTime={e.created_at}
                title={relativeTime(e.created_at)}
                className="mt-0.5 block font-numeric text-xs text-fg-muted"
              >
                {formatAbsolute(e.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ActorAvatar({ email }: { email: string | null }) {
  const initials = email
    ? email
        .split("@")[0]!
        .split(/[._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("") || email[0]!.toUpperCase()
    : "·";
  return (
    <span
      aria-hidden
      className={cn(
        "z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center",
        "rounded-full bg-surface ring-1 ring-border",
        "font-numeric text-[11px] font-medium text-fg-muted",
      )}
    >
      {initials}
    </span>
  );
}

function describeAction(action: string): string {
  switch (action) {
    case "submit":
      return "Submitted";
    // Pre-3.2.2 single-step approval. Kept so legacy audit rows
    // (and the synthetic backfill from migration 20260418000006)
    // still render as "Approved" rather than the raw action name.
    case "approve":
      return "Approved";
    case "branch_approve":
      return "Branch-approved";
    case "hq_approve":
      return "HQ-approved";
    // Pre-3.2.2 single-step reject. New flow emits step-tagged
    // variants so the timeline distinguishes who rejected and when.
    case "reject":
      return "Rejected";
    case "branch_reject":
      return "Rejected by branch";
    case "hq_reject":
      return "Rejected by HQ";
    case "cancel":
      return "Cancelled";
    case "auto_cancel_no_branch_approval":
      return "Auto-cancelled (branch timeout)";
    case "auto_cancel_no_hq_approval":
      return "Auto-cancelled (HQ timeout)";
    case "order_edited":
      return "Edited";
    case "invoice_draft_created":
      return "Draft invoice created";
    case "invoice_issued":
      return "Invoice issued";
    case "invoice_paid":
      return "Invoice paid";
    case "invoice_cancelled":
      return "Invoice cancelled";
    case "invoice_overdue":
      return "Invoice overdue";
    case "invoice_reminder":
      return "Overdue reminder sent";
    case "mollie_payment_created":
      return "Mollie payment created";
    case "mollie_webhook_received":
      return "Mollie webhook received";
    case "return_requested":
      return "Return requested";
    case "return_approved":
      return "Return approved";
    case "return_rejected":
      return "Return rejected";
    case "return_received":
      return "Return received";
    case "return_closed":
      return "Return closed";
    case "order_replacement_created":
      return "Replacement order created";
    case "cart_add":
      return "Added to cart";
    case "cart_update_qty":
      return "Updated cart quantity";
    case "cart_remove":
      return "Removed from cart";
    case "pick":
      return "Picked";
    case "pack":
      return "Packed";
    case "ship":
      return "Shipped";
    case "deliver":
      return "Delivered";
    case "return_open":
      return "Return opened";
    default:
      return action.replace(/_/g, " ");
  }
}

/**
 * Render a short, human-friendly summary of `after_json` payload bits that
 * matter on the timeline. Returns "" when nothing salient is present.
 */
function summarisePayload(action: string, payload: Json | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const obj = payload as Record<string, unknown>;
  // `branch_approve` (3.2.2b) carries the same `approved_lines` shape as
  // the legacy single-step `approve`, so both surface the "qty adjusted"
  // hint via this branch.
  if (
    (action === "approve" || action === "branch_approve") &&
    Array.isArray(obj.approved_lines)
  ) {
    const lines = obj.approved_lines as Array<{
      requested?: number;
      approved?: number;
    }>;
    const reduced = lines.filter(
      (l) =>
        typeof l.requested === "number" &&
        typeof l.approved === "number" &&
        l.approved < l.requested,
    ).length;
    if (reduced > 0) {
      return `adjusted ${reduced} line${reduced === 1 ? "" : "s"} qty down`;
    }
  }
  if (
    (action === "reject" ||
      action === "branch_reject" ||
      action === "hq_reject") &&
    typeof obj.reason === "string"
  ) {
    return truncate(obj.reason, 80);
  }
  if (
    (action === "invoice_draft_created" ||
      action === "invoice_issued" ||
      action === "invoice_paid" ||
      action === "invoice_cancelled" ||
      action === "invoice_overdue" ||
      action === "invoice_reminder") &&
    typeof obj.invoice_number === "string"
  ) {
    return obj.invoice_number;
  }
  if (action === "order_edited") {
    // `after_json` for order_edited carries line_delta + total_delta_cents
    // (see src/lib/actions/order-edit.ts). Summarise as "+1 line · +€1,20"
    // or similar — empty string when both deltas are zero.
    const lineDelta =
      typeof obj.line_delta === "number" ? obj.line_delta : 0;
    const totalDelta =
      typeof obj.total_delta_cents === "number" ? obj.total_delta_cents : 0;
    const parts: string[] = [];
    if (lineDelta !== 0) {
      parts.push(
        `${lineDelta > 0 ? "+" : ""}${lineDelta} line${
          Math.abs(lineDelta) === 1 ? "" : "s"
        }`,
      );
    }
    if (totalDelta !== 0) {
      const eur = new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
      }).format(Math.abs(totalDelta) / 100);
      parts.push(`${totalDelta > 0 ? "+" : "−"}${eur} total`);
    }
    return parts.join(" · ");
  }
  return "";
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

