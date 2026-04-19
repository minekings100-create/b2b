"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { manualPack, type PackActionState } from "@/lib/actions/packing";
import type { PickListLine } from "@/lib/db/packing";

/**
 * Phase 4 — pick-list row with inline detail expansion.
 *
 * Click anywhere on the row chrome to expand a detail panel showing the
 * barcode (text) + warehouse location prominently — implements the
 * BACKLOG entry "Inline item detail panel on the pick list" + SPEC §8.3
 * step 3. One row expanded at a time is enforced by the parent.
 *
 * Each row has a manual-qty fallback form that calls `manualPack` for
 * when the scanner can't read a label or the packer needs to bump by
 * an exact number.
 */
export function PickLineRow({
  line,
  orderId,
  isExpanded,
  onToggleExpanded,
}: {
  line: PickListLine;
  orderId: string;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const remaining = Math.max(0, line.quantity_approved - line.quantity_packed);
  const isComplete = remaining === 0;
  const isOverpack = line.quantity_packed > line.quantity_approved;

  return (
    <>
      <TableRow
        data-testid="pick-line"
        data-line-id={line.id}
        data-complete={isComplete ? "true" : "false"}
        className={cn(
          "cursor-pointer transition-colors hover:bg-surface-elevated",
          isExpanded && "bg-surface-elevated",
          isComplete && "opacity-60",
        )}
        onClick={onToggleExpanded}
      >
        <TableCell className="w-8 align-top">
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="text-fg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </TableCell>
        <TableCell className="font-numeric font-medium">{line.sku}</TableCell>
        <TableCell>{line.name}</TableCell>
        <TableCell className="font-numeric text-fg-muted">
          {line.warehouse_location ?? "—"}
        </TableCell>
        <TableCell numeric>
          <span
            className={cn(
              "font-numeric",
              isOverpack && "text-warning-subtle-fg",
              isComplete && !isOverpack && "text-success",
            )}
            data-testid="line-progress"
          >
            {line.quantity_packed}
          </span>
          <span className="text-fg-subtle"> / </span>
          <span>{line.quantity_approved}</span>
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow data-testid="pick-line-detail">
          <TableCell colSpan={5} className="bg-surface-elevated/50 py-4">
            <div className="grid grid-cols-2 gap-6 px-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Warehouse location
                </p>
                <p className="font-numeric text-2xl font-medium text-fg">
                  {line.warehouse_location ?? "Not set"}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Barcode
                </p>
                <p className="font-numeric text-base text-fg">
                  {line.primary_barcode ?? "—"}
                </p>
              </div>
              <ManualQtyForm
                orderId={orderId}
                orderItemId={line.id}
                remaining={remaining}
              />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function ManualQtyForm({
  orderId,
  orderItemId,
  remaining,
}: {
  orderId: string;
  orderItemId: string;
  remaining: number;
}) {
  const [state, action] = useFormState<PackActionState, FormData>(
    manualPack,
    undefined,
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (state?.ok === true && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [state]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="order_item_id" value={orderItemId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        Manual entry
      </p>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          name="quantity"
          type="number"
          min={1}
          max={remaining > 0 ? remaining : undefined}
          placeholder={remaining > 0 ? `Up to ${remaining}` : "0"}
          className="h-12 w-32 text-base"
          inputMode="numeric"
          data-testid="manual-qty"
        />
        <ManualSubmit />
      </div>
      {state && !state.ok ? (
        <p
          className="text-xs text-danger"
          role="alert"
          data-testid="manual-qty-error"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ManualSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="lg"
      className="h-12"
      loading={pending}
    >
      Add
    </Button>
  );
}
