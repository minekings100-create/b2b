import Link from "next/link";
import { cn } from "@/lib/utils";

import type { Database } from "@/lib/supabase/types";

export type ReturnStatusFilter = Database["public"]["Enums"]["return_status"];

const CHIPS: Array<{ label: string; value: ReturnStatusFilter | "all" }> = [
  { label: "All", value: "all" },
  { label: "Requested", value: "requested" },
  { label: "Approved", value: "approved" },
  { label: "Received", value: "received" },
  { label: "Closed", value: "closed" },
  { label: "Rejected", value: "rejected" },
];

export function ReturnStatusFilterChips({
  active,
}: {
  active: ReturnStatusFilter | "all";
}) {
  return (
    <nav
      aria-label="Filter returns by status"
      className="flex flex-wrap items-center gap-1.5 px-gutter pt-3"
    >
      {CHIPS.map((chip) => {
        const href =
          chip.value === "all" ? "/returns" : `/returns?status=${chip.value}`;
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
