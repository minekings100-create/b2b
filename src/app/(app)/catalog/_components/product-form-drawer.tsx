"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Drawer } from "@/components/ui/drawer";
import type { CatalogCategory, ProductDetail } from "@/lib/db/catalog";
import { ProductForm } from "./product-form";

type Mode = "create" | "edit";

/**
 * Opens when `?new=1` (create) or `?eid=<uuid>` (edit) is present. Closing
 * replaces history (no extra entry) — the drawer feels transient like the
 * read-only detail drawer.
 */
export function ProductFormDrawer({
  mode,
  categories,
  initial,
}: {
  mode: Mode;
  categories: CatalogCategory[];
  initial?: ProductDetail;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const closeHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("new");
    next.delete("eid");
    const qs = next.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }, [params]);

  return (
    <Drawer
      open
      onOpenChange={(next) => {
        if (!next) router.replace(closeHref, { scroll: false });
      }}
      title={mode === "create" ? "New product" : `Edit · ${initial?.sku ?? ""}`}
      widthClassName="w-full max-w-lg"
    >
      <ProductForm mode={mode} categories={categories} initial={initial} />
    </Drawer>
  );
}
