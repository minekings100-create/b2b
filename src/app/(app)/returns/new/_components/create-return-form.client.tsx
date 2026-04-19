"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createReturn,
  type ReturnActionState,
} from "@/lib/actions/returns";
import type { ReturnableLine } from "@/lib/db/returns";

/**
 * Phase 6 — create-return client form.
 *
 * Per-line: quantity (0..qty_remaining) + condition picker. Only lines
 * with quantity ≥ 1 are submitted. Simple local state; on save the
 * server action validates + creates + redirects to the new return.
 */

const CONDITIONS = [
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "surplus", label: "Surplus" },
  { value: "other", label: "Other" },
] as const;

export function CreateReturnForm({
  orderId,
  lines,
}: {
  orderId: string;
  lines: ReturnableLine[];
}) {
  const [state, action] = useFormState<ReturnActionState, FormData>(
    createReturn,
    undefined,
  );
  const [qtys, setQtys] = React.useState<Record<string, number>>({});
  const [conditions, setConditions] = React.useState<Record<string, string>>({});

  const anyPicked = Object.values(qtys).some((n) => n >= 1);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="order_id" value={orderId} />

      <div className="overflow-hidden rounded-lg ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[90px] text-right">Shipped</TableHead>
              <TableHead className="w-[90px] text-right">Returnable</TableHead>
              <TableHead className="w-[110px]">Qty to return</TableHead>
              <TableHead className="w-[160px]">Condition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const qty = qtys[l.order_item_id] ?? 0;
              const cond = conditions[l.order_item_id] ?? "";
              return (
                <TableRow key={l.order_item_id} data-testid="return-line">
                  <TableCell className="font-numeric text-fg-muted">
                    {l.sku}
                  </TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell numeric>{l.qty_approved}</TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {l.qty_remaining}
                  </TableCell>
                  <TableCell>
                    <Input
                      name={`item[${l.order_item_id}].quantity`}
                      type="number"
                      min={0}
                      max={l.qty_remaining}
                      step={1}
                      value={qty}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        setQtys((prev) => ({
                          ...prev,
                          [l.order_item_id]:
                            Number.isFinite(n) && n >= 0 ? n : 0,
                        }));
                      }}
                      disabled={l.qty_remaining === 0}
                      className="h-7 w-[80px] font-numeric"
                      aria-label={`Return quantity for ${l.sku}`}
                      data-testid={`return-qty-${l.sku}`}
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      name={`item[${l.order_item_id}].condition`}
                      value={cond}
                      onChange={(e) =>
                        setConditions((prev) => ({
                          ...prev,
                          [l.order_item_id]: e.target.value,
                        }))
                      }
                      disabled={qty < 1}
                      className="h-7 rounded-md bg-surface text-sm text-fg ring-1 ring-inset ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:opacity-50"
                      data-testid={`return-cond-${l.sku}`}
                    >
                      <option value="">Pick…</option>
                      {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="return-reason"
          className="text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Reason (optional, visible to admin)
        </label>
        <textarea
          id="return-reason"
          name="reason"
          className="min-h-[72px] rounded-md bg-surface px-3 py-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          maxLength={500}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/orders/${orderId}`}
          className="text-sm text-fg-muted hover:text-fg"
        >
          Cancel
        </Link>
        <SubmitButton disabled={!anyPicked} />
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-md bg-danger-subtle/40 px-3 py-2 text-sm text-danger-subtle-fg ring-1 ring-danger/30"
          data-testid="return-create-error"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      disabled={disabled}
      data-testid="return-create-submit"
    >
      Open return
    </Button>
  );
}
