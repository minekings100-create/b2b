"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ProductDetail } from "@/lib/db/catalog";
import type { VariantGroupOption } from "@/lib/db/variants";
import {
  joinVariantGroup,
  ungroupVariant,
  type VariantActionState,
} from "@/lib/actions/variants";

/**
 * Admin drawer section — lets a super_admin / administration user
 * attach the current product to a variant group (new or existing) or
 * leave its current group. Pure presentation — cart + order flow
 * ignore grouping entirely.
 */
export function VariantGroupSection({
  product,
  groupOptions,
}: {
  product: ProductDetail;
  groupOptions: VariantGroupOption[];
}) {
  const [state, joinAction] = useFormState<VariantActionState, FormData>(
    joinVariantGroup,
    undefined,
  );
  const [ungroupState, ungroupAction] = useFormState<
    VariantActionState,
    FormData
  >(ungroupVariant, undefined);
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  const inGroup = Boolean(product.variant_group_id);
  const siblings = (product.variants ?? []).filter(
    (s) => s.id !== product.id,
  );

  return (
    <section
      className="space-y-3 rounded-lg bg-surface-elevated/60 p-4"
      data-testid="variant-group-section"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Variant group</h3>
        {inGroup ? (
          <span className="text-[11px] text-fg-subtle font-numeric">
            {product.variant_group_id?.slice(0, 8)}…
          </span>
        ) : null}
      </div>

      {inGroup ? (
        <>
          <p className="text-xs text-fg-muted">
            This product is part of a variant group. Shoppers see siblings
            as chips on the catalog tile.
          </p>
          {siblings.length > 0 ? (
            <ul className="space-y-1" data-testid="variant-group-siblings">
              {siblings.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-bg px-3 py-2 text-xs ring-1 ring-inset ring-border"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex min-w-[40px] justify-center rounded-sm bg-surface px-1.5 py-0.5 font-numeric text-[11px] text-fg-muted ring-1 ring-inset ring-border">
                      {s.variant_label ?? "—"}
                    </span>
                    <span className="truncate text-fg">{s.name}</span>
                  </div>
                  <Link
                    href={`/catalog?eid=${s.id}`}
                    className="font-numeric text-fg-muted hover:text-fg"
                  >
                    {s.sku} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-subtle italic">
              No siblings yet — add another product to this group to see
              them here.
            </p>
          )}

          <div className="space-y-2 pt-2">
            <form
              action={joinAction}
              className="space-y-2"
              id="variant-label-form"
            >
              <input
                type="hidden"
                name="product_id"
                value={product.id}
              />
              <input
                type="hidden"
                name="group_choice"
                value={product.variant_group_id ?? ""}
              />
              <div>
                <Label htmlFor="variant_label_edit">Variant label</Label>
                <Input
                  id="variant_label_edit"
                  name="label"
                  defaultValue={product.variant_label ?? ""}
                  required
                  maxLength={30}
                  placeholder='e.g. "500ml", "Large"'
                  invalid={Boolean(fieldErrors.label)}
                  data-testid="variant-label-input"
                />
                {fieldErrors.label ? (
                  <p className="mt-1 text-xs text-danger">
                    {fieldErrors.label}
                  </p>
                ) : null}
              </div>
            </form>
            <div className="flex items-center justify-end gap-2">
              <form action={ungroupAction}>
                <input
                  type="hidden"
                  name="product_id"
                  value={product.id}
                />
                <UngroupSubmit />
              </form>
              <SaveLabelSubmit />
            </div>
          </div>
          {state && "error" in state && state.error ? (
            <p className="text-xs text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          {ungroupState && "error" in ungroupState && ungroupState.error ? (
            <p className="text-xs text-danger" role="alert">
              {ungroupState.error}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-xs text-fg-muted">
            Link this product to a variant group so shoppers can swap
            between sizes or formats without leaving the tile.
          </p>
          <form action={joinAction} className="space-y-3">
            <input
              type="hidden"
              name="product_id"
              value={product.id}
            />
            <div>
              <Label htmlFor="group_choice">Group</Label>
              <select
                id="group_choice"
                name="group_choice"
                defaultValue="new"
                className="h-9 w-full rounded-md bg-bg px-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-accent-ring"
                data-testid="variant-group-choice"
              >
                <option value="new">Create new group</option>
                {groupOptions.length > 0 ? (
                  <optgroup label="Existing groups">
                    {groupOptions.map((g) => (
                      <option key={g.group_id} value={g.group_id}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
            <div>
              <Label htmlFor="variant_label_new">Variant label</Label>
              <Input
                id="variant_label_new"
                name="label"
                required
                maxLength={30}
                placeholder='e.g. "500ml", "Large"'
                invalid={Boolean(fieldErrors.label)}
                data-testid="variant-label-input"
              />
              {fieldErrors.label ? (
                <p className="mt-1 text-xs text-danger">
                  {fieldErrors.label}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end">
              <SubmitButton>Join group</SubmitButton>
            </div>
          </form>
          {state && "error" in state && state.error ? (
            <p className="text-xs text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      {children}
    </Button>
  );
}

/**
 * "Save label" submit — lives outside the label form visually but is
 * wired back with `form="variant-label-form"` so the browser still
 * submits the right form. `useFormStatus` inside the button can't see
 * that remote form, so we don't show pending state here; the label
 * form's inputs still participate in the usual submit cycle.
 */
function SaveLabelSubmit() {
  return (
    <Button
      type="submit"
      size="sm"
      form="variant-label-form"
    >
      Save label
    </Button>
  );
}

function UngroupSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      loading={pending}
      data-testid="variant-ungroup"
    >
      Ungroup
    </Button>
  );
}
