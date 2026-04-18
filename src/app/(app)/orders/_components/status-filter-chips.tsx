import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OrderStatusFilter } from "@/lib/db/orders-list";

/**
 * Sub-milestone 3.2.1 — server-rendered status filter chips on /orders.
 * URL-driven (`?status=...`) so it works without JS and the back button
 * navigates between filter views naturally.
 */

const CHIPS: Array<{
  label: string;
  value: OrderStatusFilter | "all";
}> = [
  { label: "All", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Closed", value: "closed" },
];

export function StatusFilterChips({
  active,
}: {
  active: OrderStatusFilter | "all";
}) {
  return (
    <nav
      aria-label="Filter orders by status"
      className="flex flex-wrap items-center gap-1.5 px-gutter pt-2"
    >
      {CHIPS.map((chip) => {
        const href =
          chip.value === "all" ? "/orders" : `/orders?status=${chip.value}`;
        const isActive = chip.value === active;
        return (
          <Link
            key={chip.value}
            href={href}
            data-active={isActive || undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors duration-150",
              isActive
                ? "bg-accent-subtle text-accent-subtle-fg ring-accent/30"
                : "bg-surface text-fg-muted ring-border hover:text-fg",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
