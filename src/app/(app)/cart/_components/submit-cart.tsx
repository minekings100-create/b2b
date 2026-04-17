"use client";

import { useFormStatus } from "react-dom";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { submitOrderFormAction } from "@/lib/actions/cart";

/**
 * Plain submit form — the server action redirects on both outcomes (success
 * → /orders, blocked by outstanding invoices → /cart?block=outstanding).
 * No useFormState: we rely on server-side rendering of the block banner.
 */
export function SubmitCart({ orderId }: { orderId: string }) {
  return (
    <form action={submitOrderFormAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="confirm_override" value="" />
      <SubmitBtn />
    </form>
  );
}

export function OutstandingBlockBanner({
  orderId,
  count,
  totalCents,
}: {
  orderId: string;
  count: number;
  totalCents: number;
}) {
  const [override, setOverride] = useState("");

  return (
    <div
      role="alert"
      className="rounded-lg bg-warning-subtle/40 ring-1 ring-inset ring-warning/30 p-4 space-y-2"
    >
      <p className="inline-flex items-center gap-2 text-sm font-medium text-warning-subtle-fg">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Branch has {count} overdue invoice{count === 1 ? "" : "s"} totalling{" "}
        {formatCents(totalCents)}
      </p>
      <p className="text-xs text-fg-muted">
        Contact administration to clear them. To submit this order anyway,
        type <span className="font-numeric">CONFIRM</span> and resubmit —
        administration will be notified (Phase 3.3).
      </p>
      <form action={submitOrderFormAction} className="flex items-end gap-2">
        <input type="hidden" name="order_id" value={orderId} />
        <Input
          name="confirm_override"
          value={override}
          // Normalise at the source so the state matches what the
          // `uppercase` Tailwind class displays — otherwise typing
          // "confirm" would look like CONFIRM on-screen but keep the
          // submit button disabled.
          onChange={(e) => setOverride(e.target.value.toUpperCase())}
          placeholder="Type CONFIRM"
          className="h-8 max-w-[160px] font-numeric uppercase"
          aria-label="Confirmation phrase"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <OverrideBtn disabled={override.trim().toUpperCase() !== "CONFIRM"} />
      </form>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Send className="h-3.5 w-3.5" />
      Submit order
    </Button>
  );
}

function OverrideBtn({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      loading={pending}
      disabled={disabled}
    >
      Submit anyway
    </Button>
  );
}
