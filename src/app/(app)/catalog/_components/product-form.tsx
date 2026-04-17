"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  createProduct,
  updateProduct,
  type FormState,
} from "@/lib/actions/catalog";
import type { CatalogCategory, ProductDetail } from "@/lib/db/catalog";
import { VAT_RATES } from "@/lib/validation/product";

type Mode = "create" | "edit";

export function ProductForm({
  mode,
  categories,
  initial,
}: {
  mode: Mode;
  categories: CatalogCategory[];
  initial?: ProductDetail;
}) {
  const action = mode === "create" ? createProduct : updateProduct;
  const [state, formAction] = useFormState<FormState, FormData>(
    action,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  return (
    <>
      <form
        action={formAction}
        className="space-y-5 pb-4"
        encType="multipart/form-data"
      >
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

        <Field label="Image" name="image" error={fieldErrors.image} optional>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="block w-full text-sm text-fg file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-surface-elevated file:px-3 file:py-1 file:text-xs file:font-medium file:text-fg hover:file:bg-surface-elevated/80"
          />
          {initial?.image_path ? (
            <p className="text-xs text-fg-subtle">
              Leave empty to keep the current image.
            </p>
          ) : null}
        </Field>

        <Field label="SKU" name="sku" error={fieldErrors.sku}>
          <Input
            id="sku"
            name="sku"
            defaultValue={initial?.sku ?? ""}
            required
            autoComplete="off"
            spellCheck={false}
            autoFocus={mode === "create"}
            invalid={Boolean(fieldErrors.sku)}
            className="font-numeric uppercase"
          />
        </Field>

        <Field label="Name" name="name" error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            invalid={Boolean(fieldErrors.name)}
          />
        </Field>

        <Field
          label="Description"
          name="description"
          error={fieldErrors.description}
        >
          <textarea
            id="description"
            name="description"
            defaultValue={initial?.description ?? ""}
            rows={3}
            className="w-full rounded-md bg-surface px-3 py-2 text-sm text-fg ring-1 ring-border hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-accent-ring"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Category"
            name="category_id"
            error={fieldErrors.category_id}
          >
            <select
              id="category_id"
              name="category_id"
              defaultValue={initial?.category_id ?? ""}
              className="h-9 w-full rounded-md bg-surface px-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-accent-ring"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Unit" name="unit" error={fieldErrors.unit}>
            <Input
              id="unit"
              name="unit"
              defaultValue={initial?.unit ?? "piece"}
              required
              invalid={Boolean(fieldErrors.unit)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Unit price (€)"
            name="unit_price_cents"
            error={fieldErrors.unit_price_cents}
          >
            <Input
              id="unit_price_cents"
              name="unit_price_cents"
              type="text"
              inputMode="decimal"
              defaultValue={
                initial
                  ? (initial.unit_price_cents / 100).toFixed(2)
                  : ""
              }
              required
              className="font-numeric"
              invalid={Boolean(fieldErrors.unit_price_cents)}
            />
          </Field>

          <Field label="VAT rate" name="vat_rate" error={fieldErrors.vat_rate}>
            <select
              id="vat_rate"
              name="vat_rate"
              defaultValue={String(initial?.vat_rate ?? 21)}
              className="h-9 w-full rounded-md bg-surface px-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-accent-ring"
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Min order qty"
            name="min_order_qty"
            error={fieldErrors.min_order_qty}
          >
            <Input
              id="min_order_qty"
              name="min_order_qty"
              type="number"
              min={1}
              step={1}
              defaultValue={initial?.min_order_qty ?? 1}
              required
              className="font-numeric"
              invalid={Boolean(fieldErrors.min_order_qty)}
            />
          </Field>

          <Field
            label="Max order qty"
            name="max_order_qty"
            error={fieldErrors.max_order_qty}
            optional
          >
            <Input
              id="max_order_qty"
              name="max_order_qty"
              type="number"
              min={1}
              step={1}
              defaultValue={initial?.max_order_qty ?? ""}
              className="font-numeric"
              invalid={Boolean(fieldErrors.max_order_qty)}
            />
          </Field>
        </div>

        {state && "error" in state && state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <SubmitButton>{mode === "create" ? "Create" : "Save"}</SubmitButton>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  name,
  children,
  error,
  optional,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  error?: string;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={name}>{label}</Label>
        {optional ? (
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle">
            Optional
          </span>
        ) : null}
      </div>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {children}
    </Button>
  );
}
