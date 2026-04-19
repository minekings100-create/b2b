import { cn } from "@/lib/utils";

/**
 * Phase 6 — return (RMA) status pill. Mirrors the
 * OrderStatusPill / InvoiceStatusPill shape.
 *
 * Palette:
 *   requested   blue       — awaiting admin review
 *   approved    amber      — accepted, waiting on physical goods
 *   rejected    red        — rejected
 *   received    purple     — goods in hand
 *   processed   emerald    — resolution applied (refund / replace / cn)
 *   closed      zinc muted — terminal / archived
 */

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "processed"
  | "closed";

type PillStyle = { bg: string; text: string; ring: string; dot: string };

const STYLES: Record<ReturnStatus, PillStyle> = {
  requested: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-600/25 dark:ring-blue-500/30",
    dot: "bg-blue-600 dark:bg-blue-400",
  },
  approved: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    ring: "ring-amber-500/25 dark:ring-amber-500/25",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  rejected: {
    bg: "bg-red-50 dark:bg-red-950/60",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-600/25 dark:ring-red-500/30",
    dot: "bg-red-600 dark:bg-red-400",
  },
  received: {
    bg: "bg-purple-50 dark:bg-purple-950/60",
    text: "text-purple-700 dark:text-purple-300",
    ring: "ring-purple-600/25 dark:ring-purple-500/30",
    dot: "bg-purple-600 dark:bg-purple-400",
  },
  processed: {
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-600/25 dark:ring-emerald-500/30",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  closed: {
    bg: "bg-zinc-200/60 dark:bg-zinc-900/60",
    text: "text-zinc-500 dark:text-zinc-500",
    ring: "ring-zinc-400/40 dark:ring-zinc-700/40",
    dot: "bg-zinc-400 dark:bg-zinc-600",
  },
};

const LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  processed: "Processed",
  closed: "Closed",
};

export function ReturnStatusPill({
  status,
  size = "sm",
  className,
}: {
  status: ReturnStatus | string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const style = STYLES[status as ReturnStatus] ?? STYLES.closed;
  const label = LABELS[status as ReturnStatus] ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] ring-1 ring-inset",
        "text-[11px] font-medium leading-[14px] tracking-[-0.005em]",
        size === "lg" && "px-2.5 py-1 text-[12px] tracking-tight",
        style.bg,
        style.text,
        style.ring,
        className,
      )}
      data-status={status}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
        aria-hidden
      />
      {label}
    </span>
  );
}
