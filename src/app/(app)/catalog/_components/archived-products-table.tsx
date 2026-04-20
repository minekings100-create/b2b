"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArchivedBadge } from "@/components/app/archived-primitives";
import {
  restoreProduct,
  type FormState,
} from "@/lib/actions/catalog";
import type { CatalogProduct } from "@/lib/db/catalog";

/**
 * Phase 7b-2b — dedicated archived-only view for /catalog?archived=1.
 *
 * Kept separate from the main `<CatalogRow>` table so the click-through-
 * to-detail behaviour (which opens a drawer with add-to-cart etc.) stays
 * intact for the primary flow. Archived rows don't need that surface.
 */
export function ArchivedProductsTable({
  rows,
}: {
  rows: CatalogProduct[];
}) {
  return (
    <div className="px-gutter py-4">
      <div className="overflow-hidden rounded-lg ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="w-[180px]">Archived at</TableHead>
              <TableHead className="w-[140px] text-right">&nbsp;</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <ArchivedRow key={p.id} product={p} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ArchivedRow({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const [state, action] = useFormState<FormState, FormData>(
    restoreProduct,
    undefined,
  );
  // Restore action redirects, but during the transition state.error may
  // surface a failure. Refresh on success just in case.
  const refreshed = useRef(false);
  useEffect(() => {
    if (state && "success" in state && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state, router]);

  return (
    <TableRow className="opacity-60">
      <TableCell className="font-numeric text-fg-muted">{product.sku}</TableCell>
      <TableCell className="text-fg">
        {product.name}
        <ArchivedBadge />
      </TableCell>
      <TableCell className="hidden md:table-cell text-fg-muted">
        {product.category_name ?? "—"}
      </TableCell>
      <TableCell className="font-numeric text-xs text-fg-muted">
        {product.deleted_at
          ? product.deleted_at.slice(0, 16).replace("T", " ")
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <form action={action}>
          <input type="hidden" name="id" value={product.id} />
          <RestoreBtn productName={product.name} />
        </form>
        {state && "error" in state && state.error ? (
          <span role="alert" className="block text-[11px] text-danger">
            {state.error}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RestoreBtn({ productName }: { productName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      loading={pending}
      aria-label={`Restore ${productName}`}
    >
      <ArchiveRestore className="h-3.5 w-3.5" />
      Restore
    </Button>
  );
}
