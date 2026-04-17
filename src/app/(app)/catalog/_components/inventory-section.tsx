"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ProductDetail } from "@/lib/db/catalog";
import {
  adjustInventory,
  updateInventoryMeta,
  type InventoryFormState,
} from "@/lib/actions/inventory";

export function InventorySection({ product }: { product: ProductDetail }) {
  const inv = product.inventory;
  const onHand = inv?.quantity_on_hand ?? 0;
  const reserved = inv?.quantity_reserved ?? 0;
  const available = Math.max(0, onHand - reserved);

  return (
    <section className="space-y-4 rounded-lg bg-surface-elevated/40 p-4 ring-1 ring-inset ring-border">
      <div>
        <p className="label-meta">Inventory</p>
        <div className="mt-1 flex items-baseline gap-3 text-sm text-fg-muted">
          <span>
            <span className="font-numeric text-fg">{onHand}</span> on hand
          </span>
          <span className="text-fg-subtle">·</span>
          <span>
            <span className="font-numeric text-fg">{reserved}</span> reserved
          </span>
          <span className="text-fg-subtle">·</span>
          <span>
            <span className="font-numeric text-fg">{available}</span> available
          </span>
        </div>
      </div>

      <AdjustForm productId={product.id} />
      <MetaForm
        productId={product.id}
        reorderLevel={inv?.reorder_level ?? 0}
        warehouseLocation={inv?.warehouse_location ?? ""}
      />
    </section>
  );
}

function AdjustForm({ productId }: { productId: string }) {
  const [state, action] = useFormState<InventoryFormState, FormData>(
    adjustInventory,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="product_id" value={productId} />

      <div className="flex items-end gap-2">
        <div className="flex-shrink-0">
          <Label htmlFor="inv-direction">Direction</Label>
          <select
            id="inv-direction"
            name="direction"
            defaultValue="in"
            className="mt-1.5 h-9 rounded-md bg-surface px-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-accent-ring"
          >
            <option value="in">Add stock</option>
            <option value="out">Remove stock</option>
          </select>
        </div>
        <div className="w-[120px] flex-shrink-0">
          <Label htmlFor="inv-amount">Amount</Label>
          <Input
            id="inv-amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            defaultValue=""
            className="mt-1.5 font-numeric"
            invalid={Boolean(fieldErrors.amount)}
            required
          />
        </div>
        <div className="flex-1">
          <Label htmlFor="inv-note">Note</Label>
          <Input
            id="inv-note"
            name="note"
            placeholder="Cycle count, damaged, supplier return…"
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {state && "error" in state && state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : state && "success" in state ? (
          <p className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> Adjusted
          </p>
        ) : (
          <span />
        )}
        <AdjustSubmit />
      </div>
    </form>
  );
}

function AdjustSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      Adjust
    </Button>
  );
}

function MetaForm({
  productId,
  reorderLevel,
  warehouseLocation,
}: {
  productId: string;
  reorderLevel: number;
  warehouseLocation: string;
}) {
  const [state, action] = useFormState<InventoryFormState, FormData>(
    updateInventoryMeta,
    undefined,
  );

  return (
    <form action={action} className="flex items-end gap-2 border-t border-border pt-4">
      <input type="hidden" name="product_id" value={productId} />
      <div className="w-[120px] flex-shrink-0">
        <Label htmlFor="inv-reorder">Reorder level</Label>
        <Input
          id="inv-reorder"
          name="reorder_level"
          type="number"
          min={0}
          step={1}
          defaultValue={reorderLevel}
          className="mt-1.5 font-numeric"
        />
      </div>
      <div className="flex-1">
        <Label htmlFor="inv-location">Bin location</Label>
        <Input
          id="inv-location"
          name="warehouse_location"
          defaultValue={warehouseLocation}
          placeholder="A-01"
          className="mt-1.5 font-numeric"
        />
      </div>
      <MetaSubmit />
      {state && "error" in state && state.error ? (
        <p role="alert" className="ml-auto text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function MetaSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      Update
    </Button>
  );
}
