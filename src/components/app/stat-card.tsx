import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Phase 7a — dashboard stat card. One per metric.
 *
 * Anatomy: small uppercase label (top), large value, optional sublabel
 * for context (e.g. "€1,234 across 3 invoices"). Optional `href` makes
 * the whole card a link to the corresponding list view.
 *
 * Reuses existing tokens (`bg-surface`, `ring-border`, `font-numeric`)
 * — no new design system additions.
 */
export function StatCard({
  label,
  value,
  sublabel,
  icon,
  href,
  emphasis = "neutral",
  testId,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
  href?: string;
  /** `warning` paints the value warm — use for overdue / at-risk metrics. */
  emphasis?: "neutral" | "warning";
  testId?: string;
}) {
  const valueColor =
    emphasis === "warning"
      ? "text-warning-subtle-fg"
      : "text-fg";
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "text-fg-subtle",
              emphasis === "warning" && "text-warning-subtle-fg",
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 font-numeric text-2xl font-semibold leading-tight tracking-tight",
          valueColor,
        )}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs text-fg-muted">{sublabel}</p>
      ) : null}
    </>
  );
  const className = cn(
    "block rounded-lg bg-surface p-4 ring-1 ring-border",
    href && "transition-colors duration-150 hover:bg-surface-elevated",
  );
  if (href) {
    return (
      <Link href={href} className={className} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} data-testid={testId}>
      {inner}
    </div>
  );
}

export function StatCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
