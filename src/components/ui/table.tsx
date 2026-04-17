import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Tables:
 *   - Zebra OFF. Row hover bg-surface-elevated.
 *   - Sticky header. 40px rows (h-10). 13px body (text-sm).
 *   - Sort indicator inline, row action buttons show on row hover (use .group).
 *   - Monospace numeric cells via .font-numeric.
 */

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-10 bg-surface/95 backdrop-blur [&_tr]:border-b [&_tr]:border-border",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <tr
    ref={ref}
    data-selected={selected || undefined}
    className={cn(
      "group border-b border-border transition-colors duration-150",
      "hover:bg-surface-elevated/60",
      "data-[selected=true]:bg-accent-subtle/50",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "onClick"> & {
    sort?: "asc" | "desc" | "none";
    /** Optional href — turns the cell into a sort link (works from server components). */
    sortHref?: string;
  }
>(({ className, sort, sortHref, children, ...props }, ref) => {
  const Icon =
    sort === "asc" ? ArrowUp : sort === "desc" ? ArrowDown : ArrowUpDown;
  const showIcon = sort !== undefined;
  const content = (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {showIcon ? (
        <Icon
          className={cn(
            "h-3 w-3 transition-opacity duration-150",
            sort && sort !== "none"
              ? "text-fg opacity-100"
              : "text-fg-subtle opacity-60",
          )}
          aria-hidden
        />
      ) : null}
    </span>
  );

  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={
        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined
      }
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-fg-muted",
        sortHref &&
          "cursor-pointer select-none hover:text-fg focus-visible:text-fg focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {sortHref ? (
        <a
          href={sortHref}
          className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-sm"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </th>
  );
});
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-10 px-3 align-middle text-sm text-fg",
      numeric && "text-right font-numeric",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

/**
 * SPEC §4: row-action buttons appear on row hover. Wrap your actions in this
 * and place it inside a TableRow — it reveals on hover + focus-within.
 */
export function TableRowActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150",
        "group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
