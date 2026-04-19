"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Inbox, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveReturn,
  closeReturn,
  receiveReturn,
  rejectReturn,
  type ReturnActionState,
} from "@/lib/actions/returns";
import type { ReturnDetailItem } from "@/lib/db/returns";

/**
 * Phase 6 — admin action bar on `/returns/[id]`.
 *
 * Buttons appear / hide by status:
 *   requested → Approve | Reject (with reason)
 *   approved  → Receive (per-item resolution + restock)
 *   received  → Close
 *   processed/rejected/closed → read-only
 *
 * Money resolutions (refund / credit_note) are disabled in the UI
 * with a one-line note pointing at the Phase 6 follow-up PR. Server
 * action accepts the value but doesn't process it this PR.
 */
export function ReturnActions({
  returnId,
  status,
  items,
}: {
  returnId: string;
  status: string;
  items: ReturnDetailItem[];
}) {
  if (status === "requested") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ApproveForm returnId={returnId} />
        </div>
        <RejectForm returnId={returnId} />
      </div>
    );
  }
  if (status === "approved") {
    return <ReceiveForm returnId={returnId} items={items} />;
  }
  if (status === "received") {
    return <CloseForm returnId={returnId} />;
  }
  return null;
}

function ApproveForm({ returnId }: { returnId: string }) {
  const [state, action] = useFormState<ReturnActionState, FormData>(
    approveReturn,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="return_id" value={returnId} />
      <ApproveButton />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="return-approve-button"
    >
      <Check className="h-3.5 w-3.5" />
      Approve
    </Button>
  );
}

function RejectForm({ returnId }: { returnId: string }) {
  const [state, action] = useFormState<ReturnActionState, FormData>(
    rejectReturn,
    undefined,
  );
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {!open ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          data-testid="return-reject-toggle"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </Button>
      ) : (
        <form
          action={action}
          className="flex flex-col gap-2 rounded-md bg-surface p-3 ring-1 ring-border"
          data-testid="return-reject-form"
        >
          <input type="hidden" name="return_id" value={returnId} />
          <label
            htmlFor="reject-reason"
            className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
          >
            Reason (sent to the branch)
          </label>
          <Input
            id="reject-reason"
            name="reason"
            placeholder="A one-line explanation"
            required
            data-testid="return-reject-reason"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <RejectButton />
          </div>
          {state && !state.ok ? (
            <span className="text-xs text-danger" role="alert">
              {state.error}
            </span>
          ) : null}
        </form>
      )}
    </>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      loading={pending}
      data-testid="return-reject-submit"
    >
      Confirm reject
    </Button>
  );
}

function ReceiveForm({
  returnId,
  items,
}: {
  returnId: string;
  items: ReturnDetailItem[];
}) {
  const [state, action] = useFormState<ReturnActionState, FormData>(
    receiveReturn,
    undefined,
  );
  return (
    <form
      action={action}
      className="space-y-3 rounded-lg bg-surface p-4 ring-1 ring-border"
      data-testid="return-receive-form"
    >
      <input type="hidden" name="return_id" value={returnId} />
      <p className="text-sm text-fg-muted">
        Confirm physical receipt. For each line: pick the resolution (only{" "}
        <span className="text-fg">replace</span> is actionable in this PR —
        refund and credit note ship in a follow-up). Toggle restock if the
        returned item is back on the shelf.
      </p>
      <div className="overflow-hidden rounded-md ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated text-xs text-fg-subtle">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-left">Condition</th>
              <th className="px-3 py-2 text-left">Resolution</th>
              <th className="px-3 py-2 text-center">Restock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className="border-t border-border"
                data-testid="receive-line"
              >
                <td className="px-3 py-2">
                  <div className="font-numeric text-fg-muted">{it.sku}</div>
                  <div>{it.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-numeric">
                  {it.quantity}
                </td>
                <td className="px-3 py-2 capitalize">
                  {it.condition.replace("_", " ")}
                </td>
                <td className="px-3 py-2">
                  <select
                    name={`resolution[${it.id}]`}
                    defaultValue=""
                    className="h-8 rounded-md bg-surface text-sm text-fg ring-1 ring-inset ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                    data-testid={`receive-resolution-${it.id}`}
                  >
                    <option value="">(leave unresolved)</option>
                    <option value="replace">Replace</option>
                    <option value="refund" disabled>
                      Refund — Phase 6 follow-up
                    </option>
                    <option value="credit_note" disabled>
                      Credit note — Phase 6 follow-up
                    </option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    name={`restock[${it.id}]`}
                    className="h-4 w-4 rounded border-border accent-accent"
                    data-testid={`receive-restock-${it.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <ReceiveButton />
      </div>
      {state && !state.ok ? (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ReceiveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      loading={pending}
      data-testid="return-receive-submit"
    >
      <Inbox className="h-3.5 w-3.5" />
      Confirm receipt
    </Button>
  );
}

function CloseForm({ returnId }: { returnId: string }) {
  const [state, action] = useFormState<ReturnActionState, FormData>(
    closeReturn,
    undefined,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="return_id" value={returnId} />
      <CloseButton />
      {state && !state.ok ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function CloseButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      loading={pending}
      data-testid="return-close-button"
    >
      Close return
    </Button>
  );
}
