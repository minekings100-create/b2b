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
 * The first iteration (3.2.2a) used a 1px `h-4 w-px` divider which was
 * effectively invisible. This iteration uses `border-l` on the group
 * wrapper with `pl-3 ml-3` breathing room — same visual weight as the
 * §4 sidebar dividers, immediately readable. Active chip uses the strong
 * accent (indigo-600 fill, white text) — `accent-subtle` was too quiet.
 *
 * Draft is intentionally omitted — drafts are personal carts, not
 * "orders" in the §8.2 sense.
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
      className="flex flex-wrap items-center gap-y-1.5 px-gutter pt-2"
    >
      {GROUPS.map((group, gi) => (
        <div
          key={group.name}
          data-group={group.name.toLowerCase()}
          className={cn(
            "flex flex-wrap items-center gap-1.5",
            // Visible 1px divider between groups + breathing room. The
            // border collapses on wrap because the parent is `flex-wrap`
            // — acceptable; on narrow widths a vertical line in the
            // middle of a wrapped row would be confusing anyway.
            gi > 0 && "ml-3 border-l border-zinc-200 pl-3 dark:border-zinc-800",
          )}
          aria-label={group.name}
        >
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
                aria-pressed={isActive}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors duration-150",
                  isActive
                    ? // Strong active state — accent fill, white text.
                      // Reads at a glance; matches `Button variant="primary"`.
                      "bg-accent text-accent-fg ring-accent shadow-sm"
                    : "bg-surface text-fg-muted ring-border hover:text-fg hover:bg-surface-elevated",
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
