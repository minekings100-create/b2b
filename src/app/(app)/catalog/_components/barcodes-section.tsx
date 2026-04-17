"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Plus, Trash2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  addBarcode,
  removeBarcode,
  type BarcodeFormState,
} from "@/lib/actions/barcodes";

type Barcode = { id: string; barcode: string; unit_multiplier: number };

export function BarcodesSection({
  productId,
  initial,
}: {
  productId: string;
  initial: Barcode[];
}) {
  return (
    <section className="space-y-3 rounded-lg bg-surface-elevated/40 p-4 ring-1 ring-inset ring-border">
      <p className="label-meta">Barcodes</p>

      {initial.length > 0 ? (
        <ul className="space-y-1.5">
          {initial.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-inset ring-border"
            >
              <span className="flex items-center gap-2">
                <span className="font-numeric text-fg">{b.barcode}</span>
                {b.unit_multiplier !== 1 ? (
                  <Badge variant="neutral" dot={false}>
                    ×{b.unit_multiplier}
                  </Badge>
                ) : null}
              </span>
              <RemoveRow id={b.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">No barcodes yet.</p>
      )}

      <AddForm productId={productId} />
    </section>
  );
}

function AddForm({ productId }: { productId: string }) {
  const [state, action] = useFormState<BarcodeFormState, FormData>(
    addBarcode,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  return (
    <form action={action} className="flex items-end gap-2 border-t border-border pt-3">
      <input type="hidden" name="product_id" value={productId} />
      <div className="flex-1">
        <Label htmlFor="bc-input">Barcode</Label>
        <Input
          id="bc-input"
          name="barcode"
          placeholder="87 32 456 00012"
          autoComplete="off"
          className="mt-1.5 font-numeric"
          invalid={Boolean(fieldErrors.barcode)}
          required
        />
      </div>
      <div className="w-[100px]">
        <Label htmlFor="bc-mult">Per unit</Label>
        <Input
          id="bc-mult"
          name="unit_multiplier"
          type="number"
          min={1}
          step={1}
          defaultValue={1}
          className="mt-1.5 font-numeric"
        />
      </div>
      <AddSubmit />
      {state && "error" in state && state.error ? (
        <p role="alert" className="ml-auto text-xs text-danger">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p className="ml-auto inline-flex items-center gap-1 text-xs text-success">
          <Check className="h-3 w-3" /> Added
        </p>
      ) : null}
    </form>
  );
}

function AddSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      <Plus className="h-3.5 w-3.5" />
      Add
    </Button>
  );
}

function RemoveRow({ id }: { id: string }) {
  const [state, action] = useFormState<BarcodeFormState, FormData>(
    removeBarcode,
    undefined,
  );
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state && "error" in state && state.error ? (
        <span className="text-xs text-danger">{state.error}</span>
      ) : null}
      <RemoveSubmit />
    </form>
  );
}

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      aria-label="Remove barcode"
      loading={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
