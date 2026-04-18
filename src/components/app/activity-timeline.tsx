import { cn } from "@/lib/utils";
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
    case "approve":
      return "Approved";
    case "reject":
      return "Rejected";
    case "cancel":
      return "Cancelled";
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
    case "invoice_issue":
      return "Invoiced";
    case "invoice_paid":
      return "Marked paid";
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
  if (action === "approve" && Array.isArray(obj.approved_lines)) {
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
  if (action === "reject" && typeof obj.reason === "string") {
    return truncate(obj.reason, 80);
  }
  if (action === "invoice_issue" && typeof obj.invoice_number === "string") {
    return `as ${obj.invoice_number}`;
  }
  return "";
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);
  const past = sec >= 0;
  const fmt = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ${past ? "ago" : "from now"}`;
  if (abs < 60) return fmt(abs, "second");
  const min = Math.round(abs / 60);
  if (min < 60) return fmt(min, "minute");
  const hr = Math.round(abs / 3600);
  if (hr < 24) return fmt(hr, "hour");
  const day = Math.round(abs / 86400);
  if (day < 30) return fmt(day, "day");
  const mon = Math.round(abs / 2592000);
  if (mon < 12) return fmt(mon, "month");
  return fmt(Math.round(abs / 31536000), "year");
}
