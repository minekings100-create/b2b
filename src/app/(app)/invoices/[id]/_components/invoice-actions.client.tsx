"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelInvoice,
  issueInvoice,
  markInvoicePaid,
  type InvoiceActionState,
} from "@/lib/actions/invoices";

/**
 * Phase 5 — admin action bar on `/invoices/[id]`.
 *
 * Buttons appear / hide based on the invoice's status:
 *   draft           → Issue, Cancel
 *   issued/overdue  → Mark paid (with method selector), Cancel
 *   paid/cancelled  → no actions (terminal)
 */
export function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  if (status === "draft") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <IssueForm invoiceId={invoiceId} />
        <CancelForm invoiceId={invoiceId} />
      </div>
    );
  }
  if (status === "issued" || status === "overdue") {
    return (
      <div className="flex flex-col gap-3">
        <MarkPaidForm invoiceId={invoiceId} />
        <CancelForm invoiceId={invoiceId} />
      </div>
    );
  }
  return null;
}

function IssueForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useFormState<InvoiceActionState, FormData>(
    issueInvoice,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <IssueButton />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function IssueButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="invoice-issue-button"
    >
      <Send className="h-3.5 w-3.5" />
      Issue invoice
    </Button>
  );
}

function CancelForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useFormState<InvoiceActionState, FormData>(
    cancelInvoice,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <CancelButton />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      loading={pending}
      data-testid="invoice-cancel-button"
    >
      <X className="h-3.5 w-3.5" />
      Cancel
    </Button>
  );
}

function MarkPaidForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useFormState<InvoiceActionState, FormData>(
    markInvoicePaid,
    undefined,
  );
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3 ring-1 ring-border"
      data-testid="invoice-markpaid-form"
    >
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex flex-col gap-1">
        <label
          htmlFor="invoice-method"
          className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Method
        </label>
        <select
          id="invoice-method"
          name="method"
          defaultValue="manual_bank_transfer"
          className="h-8 rounded-md bg-surface text-sm text-fg ring-1 ring-inset ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          <option value="manual_bank_transfer">Manual bank transfer</option>
          <option value="credit_note">Credit note</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label
          htmlFor="invoice-reference"
          className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Reference (optional)
        </label>
        <Input
          id="invoice-reference"
          name="reference"
          placeholder="Bank reference, credit-note number, …"
          className="h-8"
        />
      </div>
      <MarkPaidButton />
      {state && !state.ok ? (
        <span className="basis-full text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function MarkPaidButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="invoice-markpaid-button"
    >
      <Check className="h-3.5 w-3.5" />
      Mark paid
    </Button>
  );
}
