"use client";

import * as React from "react";

import type { PickListLine } from "@/lib/db/packing";

import { PickLineRow } from "./pick-line-row.client";

/**
 * Phase 4 — pick-list table body wrapper.
 *
 * Holds the "which row is expanded" state so only one detail panel is
 * open at a time (per BACKLOG entry "Inline item detail panel on the
 * pick list"). Row click toggles; tapping another row collapses the
 * first and expands the new one.
 */
export function PickList({
  lines,
  orderId,
  readOnly,
}: {
  lines: PickListLine[];
  orderId: string;
  readOnly: boolean;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <>
      {lines.map((line) => (
        <PickLineRow
          key={line.id}
          line={line}
          orderId={orderId}
          isExpanded={expandedId === line.id}
          onToggleExpanded={() => {
            if (readOnly) return;
            setExpandedId((cur) => (cur === line.id ? null : line.id));
          }}
        />
      ))}
    </>
  );
}
