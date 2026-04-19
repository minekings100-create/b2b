"use client";

import { useFormState, useFormStatus } from "react-dom";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createDraftInvoiceFromOrder,
  type InvoiceActionState,
} from "@/lib/actions/invoices";

/**
 * Phase 5 — admin button on `/orders/[id]` for fulfilled orders that
 * don't yet have an invoice. Posts to `createDraftInvoiceFromOrder`;
 * the action itself redirects to /invoices/[id] on success (Next's
 * redirect() throws NEXT_REDIRECT past the useFormState wrapper so
 * the client follows the navigation without needing an effect).
 */
export function CreateInvoiceForm({ orderId }: { orderId: string }) {
  const [state, action] = useFormState<InvoiceActionState, FormData>(
    createDraftInvoiceFromOrder,
    undefined,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <CreateBtn />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function CreateBtn() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="create-invoice-button"
    >
      <FilePlus2 className="h-3.5 w-3.5" />
      Create draft invoice
    </Button>
  );
}
