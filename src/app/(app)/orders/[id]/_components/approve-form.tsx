"use client";

import { useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { approveOrderFormAction } from "@/lib/actions/approval";
import type { OrderDetailLine } from "@/lib/db/order-detail";

/**
 * Adjust-and-approve UI per SPEC §8.2 step 2. Each line shows requested /
 * approved (editable) / available (on_hand − reserved) + a backorder pill
 * if the local approved qty exceeds available. Approval is always allowed —
 * the banner just warns the manager.
 */
export function ApproveForm({
  orderId,
  items,
}: {
  orderId: string;
  items: OrderDetailLine[];
}) {
  const initial = useMemo(() => {
    const out: Record<string, number> = {};
    for (const it of items) out[it.id] = it.quantity_requested;
    return out;
  }, [items]);

  const [approved, setApproved] = useState<Record<string, number>>(initial);

  const backorderLines = items.filter((it) => {
    const qty = approved[it.id] ?? it.quantity_requested;
    const available = Math.max(0, it.on_hand - it.reserved);
    return qty > available;
  });

  return (
    <form action={approveOrderFormAction} className="space-y-4">
      <input type="hidden" name="order_id" value={orderId} />

      <div className="overflow-hidden rounded-lg ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[84px] text-right">Requested</TableHead>
              <TableHead className="w-[96px] text-right">Available</TableHead>
              <TableHead className="w-[120px]">Approve</TableHead>
              <TableHead className="w-[96px] text-right">Price</TableHead>
              <TableHead className="w-[112px] text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const available = Math.max(0, it.on_hand - it.reserved);
              const qty = approved[it.id] ?? it.quantity_requested;
              const overShoots = qty > available;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-numeric text-fg-muted">
                    {it.sku}
                  </TableCell>
                  <TableCell>{it.name}</TableCell>
                  <TableCell numeric>{it.quantity_requested}</TableCell>
                  <TableCell
                    numeric
                    className={cn(overShoots && "text-warning-subtle-fg")}
                  >
                    {available}
                  </TableCell>
                  <TableCell>
                    <Input
                      name={`approved[${it.id}]`}
                      type="number"
                      min={0}
                      max={it.quantity_requested}
                      step={1}
                      value={qty}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        setApproved((prev) => ({
                          ...prev,
                          [it.id]: Number.isFinite(n) && n >= 0 ? n : 0,
                        }));
                      }}
                      className="h-7 w-[88px] font-numeric"
                      aria-label={`Approved quantity for ${it.sku}`}
                      invalid={overShoots}
                    />
                  </TableCell>
                  <TableCell numeric>
                    {formatCents(it.unit_price_cents_snapshot)}
                  </TableCell>
                  <TableCell numeric>
                    {formatCents(qty * it.unit_price_cents_snapshot)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {backorderLines.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-warning-subtle/40 ring-1 ring-inset ring-warning/30 p-3 text-xs text-warning-subtle-fg"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Backorder warning:</strong> {backorderLines.length} line
            {backorderLines.length === 1 ? "" : "s"} approved beyond current
            availability. Approval is allowed — these lines will be flagged on
            the pick list.
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {backorderLines.length > 0 ? (
            <Badge variant="warning">Backorder</Badge>
          ) : null}
        </div>
        <ApproveBtn />
      </div>
    </form>
  );
}

function ApproveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Check className="h-3.5 w-3.5" />
      Approve order
    </Button>
  );
}
