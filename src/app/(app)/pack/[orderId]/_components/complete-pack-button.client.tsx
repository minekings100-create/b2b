"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  completeOrderPack,
  type PackActionState,
} from "@/lib/actions/packing";

/**
 * Phase 4 — "Complete pack" button. Enabled only when every line has
 * `quantity_packed >= quantity_approved` AND no pallet is still open.
 * The action also enforces both guards server-side; the client's
 * disabled state is UX polish.
 */
export function CompletePackButton({
  orderId,
  canComplete,
  blockReason,
}: {
  orderId: string;
  canComplete: boolean;
  blockReason: string | null;
}) {
  const [state, action] = useFormState<PackActionState, FormData>(
    completeOrderPack,
    undefined,
  );

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <Submit canComplete={canComplete} />
      {!canComplete && blockReason ? (
        <span className="text-xs text-fg-muted" data-testid="complete-block-reason">
          {blockReason}
        </span>
      ) : null}
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
      {state?.ok === true ? (
        <span
          className="text-xs text-success"
          role="status"
          data-testid="complete-success"
        >
          {state.message ?? "Order packed"}
        </span>
      ) : null}
    </form>
  );
}

function Submit({ canComplete }: { canComplete: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      loading={pending}
      disabled={!canComplete}
      data-testid="complete-pack-button"
    >
      <CheckCircle2 className="h-4 w-4" />
      Complete pack
    </Button>
  );
}
