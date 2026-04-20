"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { VariantSibling } from "@/lib/db/variants";
import { formatCents } from "@/lib/money";

/**
 * Small chip row shown on a catalog tile when the product is part of a
 * variant group. Clicking a chip swaps in that sibling's price / stock /
 * SKU / image without a route change — the tile keeps the shared name +
 * description. The "Open" link the tile wraps still points at the
 * currently-selected variant so the detail drawer opens on the right SKU.
 *
 * Purely presentational — cart + order flow use whichever variant's `id`
 * is currently selected, and `currentId` is lifted via the `onChange`
 * callback so the parent tile can re-target its wrapping `<a>`.
 */
export function VariantSwitcher({
  variants,
  currentId,
  onChange,
  dense,
}: {
  variants: VariantSibling[];
  currentId: string;
  onChange: (next: VariantSibling) => void;
  /** Dense mode skips the divider + wraps chips more tightly. */
  dense?: boolean;
}) {
  if (variants.length <= 1) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        dense ? "" : "border-t border-border pt-2",
      )}
      role="group"
      aria-label="Variants"
      data-testid="variant-switcher"
    >
      {variants.map((v) => {
        const active = v.id === currentId;
        return (
          <button
            key={v.id}
            type="button"
            onClick={(e) => {
              // Prevent the surrounding <a> (tile link) from navigating.
              e.preventDefault();
              e.stopPropagation();
              onChange(v);
            }}
            aria-pressed={active}
            title={`${v.sku} · ${formatCents(v.unit_price_cents)} · ${v.available} in stock`}
            data-testid={active ? "variant-chip-active" : "variant-chip"}
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 font-numeric text-[11px] leading-none ring-1 ring-inset transition-colors duration-120",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              active
                ? "bg-accent/10 text-accent ring-accent/40"
                : "bg-surface text-fg-muted ring-border hover:bg-surface-elevated hover:text-fg",
            )}
          >
            {v.variant_label ?? v.sku}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tile-wrapping helper that owns the "currently shown variant" state so the
 * tile's price / stock / image swap in place. Parent passes the full
 * sibling list and the default (current product). Returns a render prop
 * with the selected variant so the tile can reflect the change.
 */
export function useVariantSelection(
  variants: VariantSibling[],
  initialId: string,
) {
  const [currentId, setCurrentId] = useState(initialId);
  const current =
    variants.find((v) => v.id === currentId) ??
    ({ id: initialId } as VariantSibling);
  return { current, currentId, setCurrentId };
}
