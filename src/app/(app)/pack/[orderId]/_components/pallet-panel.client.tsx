"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { FileText, PackagePlus, Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  closePallet,
  openNewPallet,
  type PackActionState,
} from "@/lib/actions/packing";
import type { PickListPallet } from "@/lib/db/packing";

/**
 * Phase 4 — pallet side panel on the pick page.
 *
 * Renders every pallet for this order (open + closed), the "New pallet"
 * button, and per-pallet actions (Close, print label). Closing an empty
 * pallet is server-rejected.
 */
export function PalletPanel({
  orderId,
  pallets,
}: {
  orderId: string;
  pallets: PickListPallet[];
}) {
  return (
    <aside
      className="w-full space-y-3 lg:w-80 lg:shrink-0"
      data-testid="pallet-panel"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          Pallets
        </h2>
        <NewPalletButton orderId={orderId} />
      </div>
      {pallets.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border bg-surface px-3 py-4 text-xs text-fg-muted"
          data-testid="pallet-empty"
        >
          No pallets yet. One is created automatically on your first scan.
        </p>
      ) : (
        <ul className="space-y-2">
          {pallets.map((p) => (
            <PalletCard key={p.id} pallet={p} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function PalletCard({ pallet }: { pallet: PickListPallet }) {
  const isOpen = pallet.status === "open";
  const total = pallet.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <li
      data-testid="pallet-card"
      data-pallet-status={pallet.status}
      className={cn(
        "rounded-lg bg-surface p-3 ring-1 ring-border",
        !isOpen && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-numeric text-sm font-medium text-fg">
            {pallet.pallet_number}
          </p>
          <p className="text-xs text-fg-muted">
            {pallet.items.length} line{pallet.items.length === 1 ? "" : "s"} ·{" "}
            {total} unit{total === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isOpen
              ? "bg-accent-subtle text-accent-subtle-fg"
              : "bg-surface-elevated text-fg-muted",
          )}
        >
          {pallet.status}
        </span>
      </div>
      {pallet.items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-fg-muted">
          {pallet.items.map((it) => (
            <li key={it.pallet_item_id} className="flex justify-between gap-3">
              <span className="truncate">{it.name}</span>
              <span className="font-numeric">{it.quantity}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        {isOpen ? (
          <ClosePalletButton palletId={pallet.id} disabled={total === 0} />
        ) : (
          <a
            href={`/api/pdf/pallet-label/${pallet.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-elevated px-2.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border hover:text-fg hover:ring-border-strong"
            data-testid="print-label-link"
          >
            <Printer className="h-3 w-3" />
            Label PDF
          </a>
        )}
      </div>
    </li>
  );
}

function NewPalletButton({ orderId }: { orderId: string }) {
  const [, action] = useFormState<PackActionState, FormData>(
    openNewPallet,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="order_id" value={orderId} />
      <NewPalletSubmit />
    </form>
  );
}

function NewPalletSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      loading={pending}
      data-testid="new-pallet-button"
    >
      <PackagePlus className="h-3.5 w-3.5" />
      New pallet
    </Button>
  );
}

function ClosePalletButton({
  palletId,
  disabled,
}: {
  palletId: string;
  disabled: boolean;
}) {
  const [state, action] = useFormState<PackActionState, FormData>(
    closePallet,
    undefined,
  );
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="pallet_id" value={palletId} />
      <CloseSubmit disabled={disabled} />
      {state && !state.ok ? (
        <span className="ml-2 self-center text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function CloseSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      loading={pending}
      disabled={disabled}
      data-testid="close-pallet-button"
    >
      <FileText className="h-3.5 w-3.5" />
      Close pallet
    </Button>
  );
}
