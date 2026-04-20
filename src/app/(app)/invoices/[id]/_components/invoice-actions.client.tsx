"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { BellRing, Check, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelInvoice,
  issueInvoice,
  markInvoicePaid,
  type InvoiceActionState,
} from "@/lib/actions/invoices";
import {
  sendSingleReminder,
  setSkipEmailPreview,
} from "@/lib/actions/invoice-reminders";
import {
  getInvoiceIssuedPreview,
  getInvoiceReminderPreview,
  type EmailPreview,
} from "@/lib/actions/invoice-preview";
import {
  EmailPreviewModal,
  type EmailPreviewData,
} from "@/components/app/email-preview-modal.client";

/**
 * Phase 5 + Sprint 2 — admin action bar on `/invoices/[id]`.
 *
 * Sprint 2 additions:
 *   - "Issue" now opens an email preview first (unless the per-user
 *     skip flag is set). Confirming the preview issues the invoice.
 *   - New "Send reminder" button on issued + overdue invoices, also
 *     preview-first.
 *   - Mark paid / Cancel unchanged — no outbound email involved.
 */
export function InvoiceActions({
  invoiceId,
  status,
  skipEmailPreview,
}: {
  invoiceId: string;
  status: string;
  skipEmailPreview: boolean;
}) {
  if (status === "draft") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <IssueWithPreview
          invoiceId={invoiceId}
          skipEmailPreview={skipEmailPreview}
        />
      </div>
    );
  }
  if (status === "issued" || status === "overdue") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SendReminderWithPreview
            invoiceId={invoiceId}
            skipEmailPreview={skipEmailPreview}
          />
        </div>
        <MarkPaidForm invoiceId={invoiceId} />
        <CancelForm invoiceId={invoiceId} />
      </div>
    );
  }
  return null;
}

// ---------- Issue with preview -------------------------------------------

function IssueWithPreview({
  invoiceId,
  skipEmailPreview,
}: {
  invoiceId: string;
  skipEmailPreview: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<EmailPreviewData | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runIssue() {
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("invoice_id", invoiceId);
    const res = await issueInvoice(undefined, fd);
    setSending(false);
    if (res && !res.ok) {
      setError(res.error);
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  async function onClick() {
    setError(null);
    if (skipEmailPreview) {
      await runIssue();
      return;
    }
    setSending(true);
    const res = await getInvoiceIssuedPreview(invoiceId);
    setSending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setPreview(toPreviewData(res.preview));
    setModalOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        loading={sending && !modalOpen}
        onClick={onClick}
        data-testid="invoice-issue-button"
      >
        <Send className="h-3.5 w-3.5" />
        Issue invoice
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <EmailPreviewModal
        open={modalOpen}
        title="Preview: invoice issued email"
        preview={preview}
        skipToggle={{ initial: skipEmailPreview }}
        sending={sending}
        onCancel={() => setModalOpen(false)}
        onConfirm={async ({ skipNextTime }) => {
          if (skipNextTime !== skipEmailPreview) {
            await setSkipEmailPreview(skipNextTime);
          }
          await runIssue();
        }}
      />
    </>
  );
}

// ---------- Send reminder with preview -----------------------------------

function SendReminderWithPreview({
  invoiceId,
  skipEmailPreview,
}: {
  invoiceId: string;
  skipEmailPreview: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<EmailPreviewData | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultSummary, setResultSummary] = React.useState<string | null>(
    null,
  );

  async function runSend() {
    setSending(true);
    setError(null);
    const out = await sendSingleReminder(invoiceId);
    setSending(false);
    if (out.failed.length > 0) {
      setError(out.failed[0]!.reason);
      return;
    }
    setResultSummary("Reminder sent.");
    // Close after a short beat so the user sees the confirmation.
    setTimeout(() => {
      setModalOpen(false);
      setResultSummary(null);
      router.refresh();
    }, 800);
  }

  async function onClick() {
    setError(null);
    setResultSummary(null);
    if (skipEmailPreview) {
      await runSend();
      return;
    }
    setSending(true);
    const res = await getInvoiceReminderPreview(invoiceId);
    setSending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setPreview(toPreviewData(res.preview));
    setModalOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        loading={sending && !modalOpen}
        onClick={onClick}
        data-testid="invoice-send-reminder-button"
      >
        <BellRing className="h-3.5 w-3.5" />
        Send reminder
      </Button>
      {error && !modalOpen ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <EmailPreviewModal
        open={modalOpen}
        title="Preview: overdue reminder"
        preview={preview}
        skipToggle={{ initial: skipEmailPreview }}
        sending={sending}
        sendResultSummary={resultSummary}
        onCancel={() => setModalOpen(false)}
        onConfirm={async ({ skipNextTime }) => {
          if (skipNextTime !== skipEmailPreview) {
            await setSkipEmailPreview(skipNextTime);
          }
          await runSend();
        }}
      />
    </>
  );
}

function toPreviewData(p: EmailPreview): EmailPreviewData {
  return {
    recipients: p.recipients,
    subject: p.subject,
    html: p.html,
    text: p.text,
  };
}

// ---------- Existing actions (unchanged) ---------------------------------

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
