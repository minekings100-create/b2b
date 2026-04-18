import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OrderStatusFilter } from "@/lib/db/orders-list";

/**
 * Sub-milestone 3.2.2a — full status filter row.
 *
 * URL-driven (`?status=...`), Server Component so it works without JS.
 * Statuses are grouped by lifecycle phase so the eye can scan the row
 * left-to-right in the same order an order moves through the system:
 *
 *   Pending      → submitted, branch_approved          (waiting on a human)
 *   Fulfillment  → approved, picking, packed, shipped  (warehouse/transit)
 *   Done         → delivered, closed                   (completed)
 *   Halted       → rejected, cancelled                 (stopped early)
 *
 * Group separators are subtle vertical bars; on narrow widths the row
 * wraps and the bars wrap with their preceding chip via `whitespace-nowrap`
 * on the wrapper. Draft is intentionally omitted — drafts are personal
 * carts, not "orders" in the §8.2 sense.
 */

type Chip = {
  label: string;
  value: OrderStatusFilter | "all";
};

const GROUPS: Array<{ name: string; chips: Chip[] }> = [
  {
    name: "All",
    chips: [{ label: "All", value: "all" }],
  },
  {
    name: "Pending",
    chips: [
      { label: "Submitted", value: "submitted" },
      { label: "Branch approved", value: "branch_approved" },
    ],
  },
  {
    name: "Fulfillment",
    chips: [
      { label: "Approved", value: "approved" },
      { label: "Picking", value: "picking" },
      { label: "Packed", value: "packed" },
      { label: "Shipped", value: "shipped" },
    ],
  },
  {
    name: "Done",
    chips: [
      { label: "Delivered", value: "delivered" },
      { label: "Closed", value: "closed" },
    ],
  },
  {
    name: "Halted",
    chips: [
      { label: "Rejected", value: "rejected" },
      { label: "Cancelled", value: "cancelled" },
    ],
  },
];

export function StatusFilterChips({
  active,
}: {
  active: OrderStatusFilter | "all";
}) {
  return (
    <nav
      aria-label="Filter orders by status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-gutter pt-2"
    >
      {GROUPS.map((group, gi) => (
        <div
          key={group.name}
          className="flex flex-wrap items-center gap-1.5"
          aria-label={group.name}
        >
          {gi > 0 ? (
            <span
              aria-hidden
              className="hidden h-4 w-px bg-border sm:inline-block"
            />
          ) : null}
          {group.chips.map((chip) => {
            const href =
              chip.value === "all"
                ? "/orders"
                : `/orders?status=${chip.value}`;
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
                    ? "bg-accent-subtle text-accent-subtle-fg ring-accent/30"
                    : "bg-surface text-fg-muted ring-border hover:text-fg",
                )}
              >
                {chip.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
