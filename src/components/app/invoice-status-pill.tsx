import { cn } from "@/lib/utils";

/**
 * Phase 5 — invoice status → pill rendering. Mirrors the shape of
 * `OrderStatusPill` so the two feel of a piece on list pages.
 *
 * Palette:
 *   draft      zinc          — not issued yet
 *   issued     blue          — issued, awaiting payment
 *   overdue    red           — past due_at (cron-driven)
 *   paid       emerald       — closed out, paid
 *   cancelled  red (muted)   — voided
 */

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "overdue"
  | "paid"
  | "cancelled";

type PillStyle = { bg: string; text: string; ring: string; dot: string };

const STYLES: Record<InvoiceStatus, PillStyle> = {
  draft: {
    bg: "bg-zinc-100 dark:bg-zinc-800/50",
    text: "text-zinc-700 dark:text-zinc-300",
    ring: "ring-zinc-400/25 dark:ring-zinc-600/40",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
  issued: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-600/25 dark:ring-blue-500/30",
    dot: "bg-blue-600 dark:bg-blue-400",
  },
  overdue: {
    bg: "bg-red-50 dark:bg-red-950/60",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-600/25 dark:ring-red-500/30",
    dot: "bg-red-600 dark:bg-red-400",
  },
  paid: {
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-600/25 dark:ring-emerald-500/30",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  cancelled: {
    bg: "bg-red-50/60 dark:bg-red-950/30",
    text: "text-red-500 dark:text-red-400",
    ring: "ring-red-400/25 dark:ring-red-500/20",
    dot: "bg-red-400 dark:bg-red-500",
  },
};

const LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function InvoiceStatusPill({
  status,
  size = "sm",
  className,
}: {
  status: InvoiceStatus | string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const style = STYLES[status as InvoiceStatus] ?? STYLES.draft;
  const label =
    LABELS[status as InvoiceStatus] ?? status.replace(/_/g, " ");
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
