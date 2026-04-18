import { cn } from "@/lib/utils";

/**
 * Single source of truth for order-status → pill rendering.
 *
 * 3.2.2a colour palette: every status gets a visually distinct hue so the
 * /orders list is scannable at a glance. SPEC §4's base status tokens
 * (neutral/accent/success/warning/danger) cover only 5 hues — the order
 * lifecycle has 11 states, so this component renders pills directly with
 * Tailwind hue classes rather than going through `Badge`'s variant CVA.
 *
 * Mapping (light / dark — SPEC §4 extension, documented there):
 *   draft           neutral zinc        — not started
 *   submitted       blue                — info, awaiting branch decision
 *   branch_approved amber (light tint)  — mid-process, awaiting HQ
 *   approved        emerald             — green-lit, ready for warehouse
 *   picking         orange              — active warehouse work
 *   packed          purple              — stage marker
 *   shipped         cyan                — in transit
 *   delivered       green               — arrived (distinct from emerald)
 *   closed          zinc (muted)        — archived
 *   rejected        red                 — hard stop
 *   cancelled       red (muted)         — soft stop
 *
 * Each pill keeps the §4 "dot + label + tinted bg + colored text + subtle
 * ring" pattern; the dot/text/ring colours scale together so the palette
 * stays internally consistent in light and dark.
 */

export type OrderStatus =
  | "draft"
  | "submitted"
  | "branch_approved"
  | "approved"
  | "rejected"
  | "picking"
  | "packed"
  | "shipped"
  | "delivered"
  | "closed"
  | "cancelled";

type PillStyle = {
  bg: string;
  text: string;
  ring: string;
  dot: string;
};

const STYLES: Record<OrderStatus, PillStyle> = {
  draft: {
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-700 dark:text-zinc-300",
    ring: "ring-zinc-300/60 dark:ring-zinc-700/60",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
  submitted: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-600/25 dark:ring-blue-500/30",
    dot: "bg-blue-600 dark:bg-blue-400",
  },
  branch_approved: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    ring: "ring-amber-500/25 dark:ring-amber-500/25",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  approved: {
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-600/25 dark:ring-emerald-500/30",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  picking: {
    bg: "bg-orange-50 dark:bg-orange-950/60",
    text: "text-orange-700 dark:text-orange-300",
    ring: "ring-orange-600/25 dark:ring-orange-500/30",
    dot: "bg-orange-600 dark:bg-orange-400",
  },
  packed: {
    bg: "bg-purple-50 dark:bg-purple-950/60",
    text: "text-purple-700 dark:text-purple-300",
    ring: "ring-purple-600/25 dark:ring-purple-500/30",
    dot: "bg-purple-600 dark:bg-purple-400",
  },
  shipped: {
    bg: "bg-cyan-50 dark:bg-cyan-950/60",
    text: "text-cyan-700 dark:text-cyan-300",
    ring: "ring-cyan-600/25 dark:ring-cyan-500/30",
    dot: "bg-cyan-600 dark:bg-cyan-400",
  },
  delivered: {
    // Tailwind `green` is intentionally distinct from `emerald` here so
    // delivered ≠ approved at a glance — the user explicitly called this
    // out as the most common confusion in the old palette.
    bg: "bg-green-50 dark:bg-green-950/60",
    text: "text-green-800 dark:text-green-300",
    ring: "ring-green-700/25 dark:ring-green-500/30",
    dot: "bg-green-700 dark:bg-green-400",
  },
  closed: {
    bg: "bg-zinc-200/60 dark:bg-zinc-900/60",
    text: "text-zinc-500 dark:text-zinc-500",
    ring: "ring-zinc-400/40 dark:ring-zinc-700/40",
    dot: "bg-zinc-400 dark:bg-zinc-600",
  },
  rejected: {
    bg: "bg-red-50 dark:bg-red-950/60",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-600/25 dark:ring-red-500/30",
    dot: "bg-red-600 dark:bg-red-400",
  },
  cancelled: {
    bg: "bg-red-50/60 dark:bg-red-950/30",
    text: "text-red-500 dark:text-red-400",
    ring: "ring-red-400/25 dark:ring-red-500/20",
    dot: "bg-red-400 dark:bg-red-500",
  },
};

const FALLBACK: PillStyle = STYLES.draft;

export function OrderStatusPill({
  status,
  size = "sm",
  className,
}: {
  status: OrderStatus | string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const style = STYLES[status as OrderStatus] ?? FALLBACK;
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
        aria-hidden
        className={cn("inline-block h-1.5 w-1.5 rounded-full", style.dot)}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}
