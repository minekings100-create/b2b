import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";
import {
  nextSortHref,
  sortIndicator,
  type ParsedSort,
} from "@/lib/url/sort";

/**
 * Phase 7a — clickable column header. Drop-in replacement for
 * `<TableHead>` cells that participate in the URL-driven sort.
 *
 * Wrap inside a regular `<TableHead>`-using table; this component
 * renders its own `<TableHead>` so callers don't have to.
 *
 * Renders the column label + an indicator (double chevron when
 * inactive, up when asc, down when desc). Click cycles asc → desc →
 * reset (drops the sort params).
 */
export function SortableHeader<TCol extends string>({
  basePath,
  column,
  current,
  preserveParams = {},
  children,
  align = "left",
  className,
}: {
  /** e.g. `/orders` — the page route. */
  basePath: string;
  column: TCol;
  current: ParsedSort<TCol> | null;
  /** Other URL params to keep across the sort click (e.g. `?status=`). */
  preserveParams?: Record<string, string | null | undefined>;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const dir = sortIndicator(current, column);
  const href = nextSortHref(basePath, current, column, preserveParams);
  // aria-sort must sit on the <th> (columnheader role) — it's not a
  // valid attribute on <a>. Phase 7b-2d a11y.
  const ariaSort: "ascending" | "descending" | "none" =
    dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";
  return (
    <TableHead
      aria-sort={ariaSort}
      className={cn(
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <Link
        href={href}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm font-medium",
          "transition-colors duration-150",
          "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
          dir === "none" ? "text-fg-muted" : "text-fg",
        )}
        data-testid={`sort-${column}`}
        data-sort-state={dir}
      >
        {align === "right" ? <Indicator dir={dir} /> : null}
        <span>{children}</span>
        {align === "left" ? <Indicator dir={dir} /> : null}
      </Link>
    </TableHead>
  );
}

function Indicator({ dir }: { dir: "asc" | "desc" | "none" }) {
  if (dir === "asc") {
    return <ChevronUp className="h-3 w-3" aria-hidden />;
  }
  if (dir === "desc") {
    return <ChevronDown className="h-3 w-3" aria-hidden />;
  }
  return (
    <ChevronsUpDown
      className="h-3 w-3 opacity-50 group-hover:opacity-100"
      aria-hidden
    />
  );
}
