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
 * Iteration log:
 *   v1: a 1px `h-4 w-px` divider — invisible at normal density.
 *   v2: `border-l border-zinc-200/800` with breathing room — visible
 *       in light mode, still too subtle in dark mode.
 *   v3 (this): tiny uppercase group labels above each group's chip
 *       row. Explicit beats subtle; the divider becomes redundant
 *       once the structure is named, so it's gone. The "All" reset
 *       chip gets no header (it speaks for itself).
 *
 * Active chip uses the strong accent (indigo-600 fill, white text) —
 * `accent-subtle` was too quiet. `aria-pressed` is set on every chip
 * so screen readers + tests have an unambiguous signal.
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
      className="flex flex-wrap items-start gap-x-6 gap-y-3 px-gutter pt-3"
    >
      {GROUPS.map((group) => {
        const isAllGroup = group.name === "All";
        return (
          <div
            key={group.name}
            data-group={group.name.toLowerCase()}
            className="flex flex-col gap-1"
            aria-label={group.name}
          >
            {/* Group label — explicit beats subtle. The "All" reset chip
                gets no header (it's its own purpose). */}
            {!isAllGroup ? (
              // Emit uppercase at source so the DOM text matches what's
              // visible — Tailwind's `uppercase` class only transforms
              // rendering; tests + screen readers still see the source
              // text.
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {group.name.toUpperCase()}
              </span>
            ) : (
              <span aria-hidden className="h-[14px]" />
            )}
            <div className="flex flex-wrap items-center gap-1.5">
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
          </div>
        );
      })}
    </nav>
  );
}
