"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cancelOrderFormAction } from "@/lib/actions/approval";

export function CancelForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" />
        Cancel order
      </Button>
    );
  }

  return (
    <form
      action={cancelOrderFormAction}
      className="space-y-2 rounded-lg ring-1 ring-danger/30 bg-danger-subtle/20 p-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <div>
        <Label htmlFor="cancel-reason">Cancel reason (optional)</Label>
        <textarea
          id="cancel-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className="mt-1.5 w-full rounded-md bg-surface px-3 py-2 text-sm text-fg ring-1 ring-border hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-accent-ring"
          placeholder="Duplicate order, requirements changed, etc."
        />
      </div>
      <p className="text-xs text-fg-muted">
        If the order was already approved, its inventory reservations are
        released automatically.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Keep order
        </Button>
        <CancelBtn />
      </div>
    </form>
  );
}

function CancelBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" loading={pending}>
      Confirm cancel
    </Button>
  );
}
