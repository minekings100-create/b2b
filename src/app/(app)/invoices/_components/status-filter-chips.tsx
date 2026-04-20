import Link from "next/link";
import { cn } from "@/lib/utils";

import type { Database } from "@/lib/supabase/types";

/**
 * Phase 5 — invoice status filter chips. Same shape as the orders
 * variant; flatter taxonomy because the invoice lifecycle has only 5
 * states. URL-driven (`?status=...`), Server Component so it works
 * without JS.
 */

export type InvoiceStatusFilter = Database["public"]["Enums"]["invoice_status"];

const CHIPS: Array<{ label: string; value: InvoiceStatusFilter | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Issued", value: "issued" },
  { label: "Overdue", value: "overdue" },
  { label: "Paid", value: "paid" },
  { label: "Cancelled", value: "cancelled" },
];

export function InvoiceStatusFilterChips({
  active,
}: {
  active: InvoiceStatusFilter | "all";
}) {
  return (
    <nav
      aria-label="Filter invoices by status"
      className="flex flex-wrap items-center gap-1.5 px-gutter pt-3"
    >
      {CHIPS.map((chip) => {
        const href =
          chip.value === "all" ? "/invoices" : `/invoices?status=${chip.value}`;
        const isActive = chip.value === active;
        return (
          <Link
            key={chip.value}
            href={href}
            data-active={isActive || undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors duration-150",
              isActive
                ? "bg-accent text-accent-fg ring-accent shadow-sm"
                : "bg-surface text-fg-muted ring-border hover:text-fg hover:bg-surface-elevated",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
