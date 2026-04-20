"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/db/catalog";
import { formatCents } from "@/lib/money";
import { ProductThumb } from "./product-thumb";
import { StockPill } from "./stock-pill";
import { VariantSwitcher } from "./variant-switcher";

/**
 * Client-side tile for the catalog grid. Owns the "currently shown
 * variant" state when the product belongs to a variant group — clicking
 * a chip swaps in that sibling's price / stock / SKU / image in place.
 * The wrapping `<Link>` retargets to the selected sibling's detail URL
 * so opening the drawer lands on the right SKU.
 *
 * Uses `useSearchParams` to build hrefs so the parent (a Server
 * Component) doesn't need to pass a function prop across the
 * server/client boundary.
 */
export function CatalogTile({
  product,
  selectedRowId,
}: {
  product: CatalogProduct;
  selectedRowId: string | undefined;
}) {
  const params = useSearchParams();
  const baseHref = useMemo(() => {
    const base = new URLSearchParams(params?.toString() ?? "");
    return (pid: string) => {
      const next = new URLSearchParams(base);
      next.set("pid", pid);
      return `/catalog?${next.toString()}`;
    };
  }, [params]);
  const siblings = product.variants;
  const hasSiblings = siblings.length > 1;
  const [currentId, setCurrentId] = useState(product.id);
  const current =
    siblings.find((s) => s.id === currentId) ?? null;

  const displaySku = current?.sku ?? product.sku;
  const displayPrice = current?.unit_price_cents ?? product.unit_price_cents;
  const displayAvail = current?.available ?? product.available;
  const displayImage =
    current && current.id !== product.id
      ? current.image_url
      : product.image_url;
  const targetId = current?.id ?? product.id;
  const selected = selectedRowId === targetId;

  return (
    <Link
      href={baseHref(targetId)}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "group/tile block cursor-pointer rounded-lg bg-surface ring-1 ring-border transition-colors duration-150",
        "hover:bg-zinc-50 hover:ring-border-strong dark:hover:bg-zinc-900/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
        selected && "ring-2 ring-accent",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-surface-elevated">
        {displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayImage}
            alt={product.name}
            className="h-full w-full object-cover transition-opacity duration-150 group-hover/tile:opacity-95"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ProductThumb
              src={null}
              alt={product.name}
              size={40}
              className="ring-0 bg-transparent"
            />
          </div>
        )}
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <p
          className="font-numeric text-[11px] uppercase tracking-wide text-fg-muted"
          data-testid="tile-sku"
        >
          {displaySku}
        </p>
        <p
          className="line-clamp-2 text-sm font-medium text-fg"
          title={product.name}
        >
          {product.name}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            className="font-numeric text-sm text-fg"
            data-testid="tile-price"
          >
            {formatCents(displayPrice)}
          </span>
          <StockPill
            available={displayAvail}
            reorderLevel={product.inventory?.reorder_level ?? 0}
          />
        </div>
        {hasSiblings ? (
          <VariantSwitcher
            variants={siblings}
            currentId={targetId}
            onChange={(next) => setCurrentId(next.id)}
          />
        ) : null}
      </div>
    </Link>
  );
}
