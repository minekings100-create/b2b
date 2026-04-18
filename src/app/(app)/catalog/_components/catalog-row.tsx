"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

/**
 * Sub-milestone 3.2.1 — entire catalog row clickable.
 *
 * Why a client component: <a> can't wrap <tr> safely, and the absolute-pos
 * Link trick requires `position: relative` on a <tr>, which has known
 * cross-browser quirks. A tiny client wrapper around <TableRow> with an
 * onClick → router.push is simpler and keeps the keyboard-accessible Link
 * inside the SKU cell as the primary tab target.
 *
 * Clicks that originate inside an <a>, <button>, <input>, <select>, or
 * `[data-row-stop]` element bubble up but are ignored — this preserves
 * "Add to cart" and similar inline actions per the spec.
 */
export function CatalogRow({
  href,
  selected,
  children,
}: {
  href: string;
  selected?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function shouldIgnore(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return (
      target.closest(
        "a, button, input, select, textarea, label, [data-row-stop]",
      ) !== null
    );
  }

  return (
    <TableRow
      selected={selected}
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      onClick={(e) => {
        if (shouldIgnore(e.target)) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
