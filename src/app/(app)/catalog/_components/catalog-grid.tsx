import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/db/catalog";
import { formatCents } from "@/lib/money";
import { ProductThumb } from "./product-thumb";
import { StockPill } from "./stock-pill";

/**
 * Grid view — image-forward tiles. 2 cols on mobile, 3 on tablet, 4-6 on
 * wider desktop. Each tile opens the detail drawer via `?pid=`.
 */
export function CatalogGrid({
  rows,
  rowHref,
  selectedId,
}: {
  rows: CatalogProduct[];
  rowHref: (pid: string) => string;
  selectedId: string | undefined;
}) {
  return (
    <div className="px-gutter py-4">
      <ul
        role="list"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={rowHref(p.id)}
              aria-current={selectedId === p.id ? "page" : undefined}
              className={cn(
                "group/tile block cursor-pointer rounded-lg bg-surface ring-1 ring-border transition-colors duration-150",
                "hover:bg-zinc-50 hover:ring-border-strong dark:hover:bg-zinc-900/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                selectedId === p.id && "ring-2 ring-accent",
              )}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-surface-elevated">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-full w-full object-cover transition-opacity duration-150 group-hover/tile:opacity-95"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ProductThumb src={null} alt={p.name} size={40} className="ring-0 bg-transparent" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="font-numeric text-[11px] uppercase tracking-wide text-fg-muted">
                  {p.sku}
                </p>
                <p
                  className="line-clamp-2 text-sm font-medium text-fg"
                  title={p.name}
                >
                  {p.name}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-numeric text-sm text-fg">
                    {formatCents(p.unit_price_cents)}
                  </span>
                  <StockPill
                    available={p.available}
                    reorderLevel={p.inventory?.reorder_level ?? 0}
                  />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
