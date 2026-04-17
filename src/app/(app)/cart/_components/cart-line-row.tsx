"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import {
  removeCartItem,
  updateCartItemQty,
  type CartActionState,
} from "@/lib/actions/cart";
import type { CartLine } from "@/lib/db/cart";

export function CartLineRow({ line }: { line: CartLine }) {
  const router = useRouter();
  const [qtyState, qtyAction] = useFormState<CartActionState, FormData>(
    updateCartItemQty,
    undefined,
  );
  const [rmState, rmAction] = useFormState<CartActionState, FormData>(
    removeCartItem,
    undefined,
  );
  const [qty, setQty] = useState(String(line.quantity_requested));
  const lastOk = useRef<string | null>(null);

  // Keep local input in sync with server truth when a successful mutation
  // lands (server might clamp or merge quantities in the future).
  useEffect(() => {
    setQty(String(line.quantity_requested));
  }, [line.quantity_requested]);

  useEffect(() => {
    const ok = qtyState && "success" in qtyState ? "q" : null;
    const ok2 = rmState && "success" in rmState ? "r" : null;
    const marker = `${ok}${ok2}`;
    if ((ok || ok2) && marker !== lastOk.current) {
      lastOk.current = marker;
      router.refresh();
    }
  }, [qtyState, rmState, router]);

  const error =
    (qtyState && "error" in qtyState && qtyState.error) ||
    (rmState && "error" in rmState && rmState.error) ||
    null;

  return (
    <TableRow>
      <TableCell className="font-numeric text-fg-muted">{line.sku}</TableCell>
      <TableCell>{line.name}</TableCell>
      <TableCell className="text-fg-muted">{line.unit}</TableCell>
      <TableCell numeric>{formatCents(line.unit_price_cents_snapshot)}</TableCell>
      <TableCell numeric className="text-fg-muted">
        {line.vat_rate_snapshot}%
      </TableCell>
      <TableCell>
        <form action={qtyAction} className="flex items-center gap-1.5">
          <input type="hidden" name="item_id" value={line.id} />
          <Input
            name="quantity"
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-7 w-[76px] font-numeric"
            aria-label={`Quantity for ${line.sku}`}
          />
          <SaveBtn />
        </form>
      </TableCell>
      <TableCell numeric>{formatCents(line.line_net_cents)}</TableCell>
      <TableCell>
        <form action={rmAction}>
          <input type="hidden" name="item_id" value={line.id} />
          <RmBtn sku={line.sku} />
        </form>
        {error ? (
          <span role="alert" className="block text-xs text-danger">
            {error}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="icon" loading={pending} aria-label="Update quantity">
      <Check className="h-3.5 w-3.5" />
    </Button>
  );
}

function RmBtn({ sku }: { sku: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      loading={pending}
      aria-label={`Remove ${sku}`}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
