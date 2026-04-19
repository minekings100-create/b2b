"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { formatCents } from "@/lib/money";
import { editOrder, type EditOrderState } from "@/lib/actions/order-edit";

/**
 * Phase 3.4 — edit-order client form.
 *
 * Holds the desired state locally: a list of { product_id, sku, name,
 * price, vat_rate, quantity } lines. Each row has a qty input + remove
 * button; a single search input adds new lines by calling
 * `/api/catalog/search?q=...`. On Save we POST every non-zero-qty
 * line to `editOrder`, with a confirm modal that spells out "your
 * branch manager will need to approve again".
 */

export type EditLine = {
  product_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  vat_rate: number;
  min_order_qty: number;
  max_order_qty: number | null;
  quantity: number;
};

export function EditForm({
  orderId,
  lastEditedAt,
  initialLines,
  initialNotes,
}: {
  orderId: string;
  lastEditedAt: string | null;
  initialLines: EditLine[];
  initialNotes: string;
}) {
  const [state, action] = useFormState<EditOrderState, FormData>(
    editOrder,
    undefined,
  );
  const [lines, setLines] = React.useState<EditLine[]>(initialLines);
  const [notes, setNotes] = React.useState(initialNotes);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const updateQty = (productId: string, next: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product_id === productId ? { ...l, quantity: next } : l,
      ),
    );
  };
  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.product_id !== productId));
  };
  const addLine = (line: EditLine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === line.product_id);
      if (existing) return prev; // already present — user can bump qty manually
      return [...prev, line];
    });
  };

  const net = lines.reduce(
    (sum, l) => sum + l.quantity * l.unit_price_cents,
    0,
  );
  const vat = lines.reduce(
    (sum, l) =>
      sum +
      Math.round((l.quantity * l.unit_price_cents * l.vat_rate) / 100),
    0,
  );
  const gross = net + vat;

  const canSave = lines.length > 0 && lines.every((l) => l.quantity >= 1);

  return (
    <>
      <form ref={formRef} action={action} className="space-y-6">
        <input type="hidden" name="order_id" value={orderId} />
        <input
          type="hidden"
          name="last_edited_at_expected"
          value={lastEditedAt ?? ""}
        />
        <input type="hidden" name="notes" value={notes} />
        {lines.map((l) => (
          <input
            key={l.product_id}
            type="hidden"
            name={`line[${l.product_id}].quantity`}
            value={l.quantity}
          />
        ))}

        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[96px] text-right">Price</TableHead>
                <TableHead className="w-[72px] text-right">VAT</TableHead>
                <TableHead className="w-[140px]">Qty</TableHead>
                <TableHead className="w-[110px] text-right">Line total</TableHead>
                <TableHead className="w-[60px]">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.product_id} data-testid="edit-line">
                  <TableCell className="font-numeric text-fg-muted">
                    {l.sku}
                  </TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell numeric>
                    {formatCents(l.unit_price_cents)}
                  </TableCell>
                  <TableCell numeric>{l.vat_rate}%</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      max={l.max_order_qty ?? undefined}
                      step={1}
                      value={l.quantity}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        updateQty(
                          l.product_id,
                          Number.isFinite(n) && n >= 1 ? n : 1,
                        );
                      }}
                      className="h-7 w-[104px] font-numeric"
                      aria-label={`Quantity for ${l.sku}`}
                      data-testid={`edit-qty-${l.sku}`}
                    />
                  </TableCell>
                  <TableCell numeric>
                    {formatCents(l.quantity * l.unit_price_cents)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(l.product_id)}
                      aria-label={`Remove ${l.sku}`}
                      data-testid={`edit-remove-${l.sku}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-sm text-fg-muted"
                  >
                    No lines. Add a product below or
                    <Link
                      href={`/orders/${orderId}`}
                      className="ml-1 underline hover:text-fg"
                    >
                      cancel
                    </Link>
                    .
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <AddProduct onPick={(p) => addLine(p)} existingIds={new Set(lines.map((l) => l.product_id))} />

        <div className="grid gap-2">
          <label htmlFor="edit-notes" className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Notes (optional)
          </label>
          <textarea
            id="edit-notes"
            name="notes-display"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[72px] rounded-md bg-surface px-3 py-2 text-sm text-fg ring-1 ring-inset ring-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            maxLength={1000}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-fg-muted">
              Net <span className="font-numeric text-fg">{formatCents(net)}</span>
            </span>
            <span className="text-fg-muted">
              VAT <span className="font-numeric text-fg">{formatCents(vat)}</span>
            </span>
            <span className="text-fg">
              Total <span className="font-numeric font-semibold">{formatCents(gross)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/orders/${orderId}`}
              className="text-sm text-fg-muted hover:text-fg"
              data-testid="edit-cancel-link"
            >
              Cancel (discard)
            </Link>
            <Button
              type="button"
              variant="primary"
              disabled={!canSave}
              onClick={() => setConfirmOpen(true)}
              data-testid="edit-open-confirm"
            >
              Save changes
            </Button>
          </div>
        </div>

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-md bg-danger-subtle/40 px-3 py-2 text-sm text-danger-subtle-fg ring-1 ring-danger/30"
            data-testid="edit-error"
          >
            {state.error}
          </p>
        ) : null}

        {confirmOpen ? (
          <ConfirmModal
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              formRef.current?.requestSubmit();
            }}
          />
        ) : null}
      </form>
    </>
  );
}

function ConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm edit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      data-testid="edit-confirm-modal"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-surface p-6 ring-1 ring-border shadow-lg">
        <h2 className="text-base font-semibold text-fg">Save changes?</h2>
        <p className="text-sm text-fg-muted">
          Your branch manager will need to approve this order again after you
          save.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            data-testid="edit-confirm-cancel"
          >
            Cancel
          </Button>
          <ConfirmSubmit onConfirm={onConfirm} />
        </div>
      </div>
    </div>
  );
}

function ConfirmSubmit({ onConfirm }: { onConfirm: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="button"
      variant="primary"
      loading={pending}
      onClick={onConfirm}
      data-testid="edit-confirm-save"
    >
      Save and resubmit
    </Button>
  );
}

type SearchResult = {
  id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  vat_rate: number;
  min_order_qty: number;
  max_order_qty: number | null;
};

function AddProduct({
  onPick,
  existingIds,
}: {
  onPick: (line: EditLine) => void;
  existingIds: Set<string>;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);

  // Debounced server-side catalog search. Threshold of 2 chars matches
  // the API route's own short-query guard.
  React.useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Search failed");
        const body = (await res.json()) as { items: SearchResult[] };
        if (!cancelled) {
          setResults(body.items);
          setHasSearched(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div
      className="rounded-lg bg-surface p-4 ring-1 ring-border"
      data-testid="edit-add-product"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        Add product
      </p>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by SKU or name (min 2 characters)"
          className="pl-8"
          data-testid="edit-add-search"
        />
      </div>
      {q.trim().length >= 2 ? (
        <ul
          className="mt-3 max-h-56 space-y-1 overflow-auto"
          data-testid="edit-add-results"
        >
          {loading ? (
            <li className="text-xs text-fg-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="text-xs text-fg-muted">
              {hasSearched ? "No matches." : ""}
            </li>
          ) : (
            results.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface-elevated",
                )}
              >
                <span className="flex-1 text-sm">
                  <span className="font-numeric text-fg-muted">{r.sku}</span>
                  <span className="ml-2 text-fg">{r.name}</span>
                  <span className="ml-2 font-numeric text-fg-muted">
                    {formatCents(r.unit_price_cents)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={existingIds.has(r.id)}
                  onClick={() =>
                    onPick({
                      product_id: r.id,
                      sku: r.sku,
                      name: r.name,
                      unit_price_cents: r.unit_price_cents,
                      vat_rate: r.vat_rate,
                      min_order_qty: r.min_order_qty,
                      max_order_qty: r.max_order_qty,
                      quantity: Math.max(1, r.min_order_qty),
                    })
                  }
                  data-testid={`edit-add-${r.sku}`}
                >
                  <Plus className="h-3 w-3" />
                  {existingIds.has(r.id) ? "Added" : "Add"}
                </Button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
