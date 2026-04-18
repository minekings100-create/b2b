"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { rejectOrderFormAction } from "@/lib/actions/approval";

export function RejectForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </Button>
    );
  }

  return (
    <form
      action={rejectOrderFormAction}
      className="space-y-2 rounded-lg bg-surface ring-1 ring-border p-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <div>
        <Label htmlFor="rej-reason">Rejection reason</Label>
        <textarea
          id="rej-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          minLength={4}
          maxLength={500}
          required
          className="mt-1.5 w-full rounded-md bg-surface px-3 py-2 text-sm text-fg ring-1 ring-border hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-accent-ring"
          placeholder="Over monthly budget — please resubmit next month."
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <RejectBtn disabled={reason.trim().length < 4} />
      </div>
    </form>
  );
}

function RejectBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" loading={pending} disabled={disabled}>
      Confirm reject
    </Button>
  );
}
