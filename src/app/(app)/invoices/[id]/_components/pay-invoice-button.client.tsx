"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  payInvoiceWithMollie,
  type MolliePayState,
} from "@/lib/actions/mollie-payments";

/**
 * Phase 6 — "Pay with iDEAL" button. Rendered for any caller who can
 * see the invoice (admin + branch) when status is issued/overdue.
 * The action redirects the browser to a Mollie checkout (mock today;
 * live Mollie when credentials land).
 */
export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useFormState<MolliePayState, FormData>(
    payInvoiceWithMollie,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <PayBtn />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function PayBtn() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="pay-invoice-button"
    >
      <CreditCard className="h-3.5 w-3.5" />
      Pay with iDEAL
    </Button>
  );
}
