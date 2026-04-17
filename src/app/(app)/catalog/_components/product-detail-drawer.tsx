"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import type { ProductDetail } from "@/lib/db/catalog";
import { formatCents } from "@/lib/money";
import { StockPill } from "./stock-pill";

/**
 * Wraps the base Drawer primitive with URL-param state. Opens when `?pid=`
 * matches this product's id. Close clears the param and replaces history
 * (no new entry — the drawer feels transient).
 */
export function ProductDetailDrawer({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("pid") === product.id;

  const closeHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("pid");
    const qs = next.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }, [params]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) router.replace(closeHref, { scroll: false });
      }}
      title={
        <span className="flex items-center gap-2">
          <span className="font-numeric text-sm text-fg-muted">{product.sku}</span>
          <span className="truncate">{product.name}</span>
        </span>
      }
    >
      <div className="space-y-6">
        <section>
          <p className="label-meta mb-1">Availability</p>
          <div className="flex flex-wrap items-center gap-2">
            <StockPill
              available={product.available}
              reorderLevel={product.inventory?.reorder_level ?? 0}
            />
            <span className="text-sm text-fg-muted">
              <span className="font-numeric text-fg">{product.available}</span> available
              <span className="mx-1.5 text-fg-subtle">·</span>
              <span className="font-numeric text-fg">
                {product.inventory?.quantity_on_hand ?? 0}
              </span>{" "}
              on hand
              <span className="mx-1.5 text-fg-subtle">·</span>
              <span className="font-numeric text-fg">
                {product.inventory?.quantity_reserved ?? 0}
              </span>{" "}
              reserved
            </span>
          </div>
        </section>

        {product.description ? (
          <section>
            <p className="label-meta mb-1">Description</p>
            <p className="text-sm text-fg leading-relaxed">{product.description}</p>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Cell label="Category" value={product.category_name ?? "—"} />
          <Cell label="Unit" value={product.unit} />
          <Cell
            label="Unit price"
            value={formatCents(product.unit_price_cents)}
            mono
          />
          <Cell label="VAT" value={`${product.vat_rate}%`} mono />
          <Cell label="Min order" value={String(product.min_order_qty)} mono />
          <Cell
            label="Max order"
            value={product.max_order_qty != null ? String(product.max_order_qty) : "—"}
            mono
          />
          <Cell
            label="Bin location"
            value={product.inventory?.warehouse_location ?? "—"}
            mono
          />
          <Cell
            label="Reorder level"
            value={String(product.inventory?.reorder_level ?? 0)}
            mono
          />
        </section>

        {product.barcodes.length > 0 ? (
          <section>
            <p className="label-meta mb-2">Barcodes</p>
            <ul className="space-y-1.5">
              {product.barcodes.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md bg-surface-elevated/60 px-3 py-2 text-sm"
                >
                  <span className="font-numeric text-fg">{b.barcode}</span>
                  {b.unit_multiplier !== 1 ? (
                    <Badge variant="neutral" dot={false}>
                      ×{b.unit_multiplier}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="label-meta">{label}</p>
      <p className={mono ? "text-sm text-fg font-numeric" : "text-sm text-fg"}>
        {value}
      </p>
    </div>
  );
}
