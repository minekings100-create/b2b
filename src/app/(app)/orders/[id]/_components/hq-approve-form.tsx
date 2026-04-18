"use client";

import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { hqApproveOrderFormAction } from "@/lib/actions/approval";
import type { OrderDetailLine } from "@/lib/db/order-detail";

/**
 * Step-2 (HQ Manager) approve UI — SPEC §8.2.
 *
 * HQ does NOT adjust quantities. The form renders the branch-approved
 * lines read-only and offers a single Confirm/Reject choice. Reject is a
 * sibling component (RejectForm) — we keep the approve side minimal.
 */
export function HqApproveForm({
  orderId,
  items,
}: {
  orderId: string;
  items: OrderDetailLine[];
}) {
  return (
    <form action={hqApproveOrderFormAction} className="space-y-4">
      <input type="hidden" name="order_id" value={orderId} />

      <div className="overflow-hidden rounded-lg ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[84px] text-right">Requested</TableHead>
              <TableHead className="w-[96px] text-right">Branch approved</TableHead>
              <TableHead className="w-[96px] text-right">Price</TableHead>
              <TableHead className="w-[112px] text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const qty = it.quantity_approved ?? 0;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-numeric text-fg-muted">
                    {it.sku}
                  </TableCell>
                  <TableCell>{it.name}</TableCell>
                  <TableCell numeric>{it.quantity_requested}</TableCell>
                  <TableCell numeric>{qty}</TableCell>
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

      <p className="text-xs text-fg-muted">
        Quantities were set by the Branch Manager at step 1. HQ approval is a
        yes/no decision on the package — to change a line, reject the order
        with a reason so the branch can resubmit.
      </p>

      <div className="flex items-center justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Check className="h-3.5 w-3.5" />
      HQ-approve order
    </Button>
  );
}
