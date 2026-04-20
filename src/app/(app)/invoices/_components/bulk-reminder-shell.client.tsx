"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusPill } from "@/components/app/invoice-status-pill";
import {
  EmailPreviewModal,
  type BulkPreviewData,
} from "@/components/app/email-preview-modal.client";
import {
  getBulkReminderPreview,
  type EmailPreview,
} from "@/lib/actions/invoice-preview";
import {
  sendBulkReminders,
  setSkipEmailPreview,
} from "@/lib/actions/invoice-reminders";
import { formatCents } from "@/lib/money";

/**
 * Post-MVP Sprint 2 — interactive invoices table with bulk reminder
 * action bar for admins viewing the overdue filter.
 *
 * The server page renders static columns (Invoice / Order / Branch /
 * Status / Issued / Due / Total) via the `SortableHeader` + `Link`
 * pattern. This client shell wraps the same layout so we can own
 * selection state + the floating action bar. Sortable headers stay
 * in the parent Server Component; this shell receives the pre-sorted
 * rows.
 */

export type InvoicesBulkRow = {
  id: string;
  invoice_number: string;
  order_number: string | null;
  order_id: string | null;
  branch_code: string;
  branch_name: string;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  total_gross_cents: number;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

export function BulkReminderShell({
  rows,
  showCheckboxes,
  skipEmailPreview,
  headerSlot,
}: {
  rows: InvoicesBulkRow[];
  /**
   * Only true for admin + `?status=overdue`. When false, the shell
   * renders the table without the checkbox column (non-admin view OR
   * non-overdue filter — bulk reminder doesn't apply).
   */
  showCheckboxes: boolean;
  skipEmailPreview: boolean;
  /**
   * Sortable column headers rendered by the parent Server Component.
   * This shell slots them inside the `<TableHeader>` so a server-owned
   * `<SortableHeader>` + URL-driven sort stays intact.
   */
  headerSlot: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<BulkPreviewData | null>(
    null,
  );
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendProgress, setSendProgress] = React.useState<string | null>(null);
  const [resultSummary, setResultSummary] = React.useState<string | null>(null);
  const [errorList, setErrorList] = React.useState<
    Array<{ invoice_id: string; reason: string }>
  >([]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(() => (on ? new Set(rows.map((r) => r.id)) : new Set()));
  }

  function clear() {
    setSelected(new Set());
    setErrorList([]);
    setResultSummary(null);
  }

  async function runBulkSend(): Promise<void> {
    if (!previewData || previewData.sendable_count === 0) return;
    const ids = rowIdsForSendable(previewData, rows, selected);
    setSending(true);
    setSendProgress(`Sending 1 of ${ids.length}…`);
    // Call the bulk action once — it processes sequentially server-side.
    // Client-side progress is a best-effort indicator; the action's
    // result surfaces the true sent / failed split.
    const start = Date.now();
    const result = await sendBulkReminders(ids);
    const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));
    setSending(false);
    setSendProgress(null);
    setResultSummary(
      `Sent ${result.sent.length} of ${ids.length}${
        result.failed.length > 0
          ? ` — ${result.failed.length} failed`
          : ""
      } (${elapsed}s).`,
    );
    setErrorList(result.failed);
    if (result.failed.length === 0) {
      // Clean close after a visible confirmation.
      setTimeout(() => {
        setModalOpen(false);
        clear();
        router.refresh();
      }, 1200);
    } else {
      // Leave the modal open so the admin can read the failure list.
      router.refresh();
    }
  }

  async function openPreview() {
    if (!someSelected) return;
    setLoadingPreview(true);
    setErrorList([]);
    setResultSummary(null);
    const ids = Array.from(selected);
    const res = await getBulkReminderPreview(ids);
    setLoadingPreview(false);
    if ("error" in res) {
      setErrorList([{ invoice_id: "—", reason: res.error }]);
      return;
    }
    const sample: EmailPreview | null = res.preview.sample;
    setPreviewData({
      total: res.preview.total,
      sendable_count: res.preview.sendable.length,
      sample: sample
        ? {
            recipients: sample.recipients,
            subject: sample.subject,
            html: sample.html,
            text: sample.text,
          }
        : null,
      skipped: res.preview.skipped,
    });
    setModalOpen(true);
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes ? (
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  data-testid="invoices-select-all"
                  className="h-4 w-4 rounded border-border accent-accent"
                />
              </TableHead>
            ) : null}
            {headerSlot}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isSelected = selected.has(r.id);
            return (
              <TableRow
                key={r.id}
                className="transition-colors hover:bg-surface-elevated"
                data-selected={isSelected || undefined}
              >
                {showCheckboxes ? (
                  <TableCell className="w-[40px]">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${r.invoice_number}`}
                      checked={isSelected}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                      data-testid={`invoices-select-${r.invoice_number}`}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                  </TableCell>
                ) : null}
                <TableCell className="font-numeric font-medium">
                  <Link
                    href={`/invoices/${r.id}`}
                    className="text-fg hover:underline"
                    data-testid={`invoice-row-${r.invoice_number}`}
                  >
                    {r.invoice_number}
                  </Link>
                </TableCell>
                <TableCell className="font-numeric text-fg-muted">
                  {r.order_number ? (
                    <Link
                      href={`/orders/${r.order_id}`}
                      className="hover:underline"
                    >
                      {r.order_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-fg">{r.branch_code}</span>
                  <span className="ml-2 text-fg-muted">{r.branch_name}</span>
                </TableCell>
                <TableCell>
                  <InvoiceStatusPill status={r.status} />
                </TableCell>
                <TableCell numeric className="text-fg-muted">
                  {formatDate(r.issued_at)}
                </TableCell>
                <TableCell numeric className="text-fg-muted">
                  {formatDate(r.due_at)}
                </TableCell>
                <TableCell numeric>{formatCents(r.total_gross_cents)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {showCheckboxes && someSelected ? (
        <div
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
          data-testid="bulk-action-bar"
        >
          <div className="flex items-center gap-3 rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg">
            <span className="font-medium" data-testid="bulk-count">
              {selected.size} selected
            </span>
            <span className="h-4 w-px bg-bg/20" aria-hidden />
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={loadingPreview}
              onClick={openPreview}
              data-testid="bulk-send-reminder"
            >
              <BellRing className="h-3.5 w-3.5" />
              Send reminder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clear}
              aria-label="Clear selection"
              className="text-bg hover:bg-bg/10"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <EmailPreviewModal
        open={modalOpen}
        title={`Bulk reminder preview — ${previewData?.total ?? 0} invoice${previewData?.total === 1 ? "" : "s"}`}
        bulk={previewData}
        skipToggle={{ initial: skipEmailPreview }}
        sending={sending}
        sendProgress={sendProgress}
        sendResultSummary={resultSummary}
        onCancel={() => {
          if (sending) return;
          setModalOpen(false);
          if (errorList.length === 0) setResultSummary(null);
        }}
        onConfirm={async ({ skipNextTime }) => {
          if (skipNextTime !== skipEmailPreview) {
            await setSkipEmailPreview(skipNextTime);
          }
          await runBulkSend();
        }}
      />

      {errorList.length > 0 && !modalOpen ? (
        <div
          role="alert"
          className="mt-4 rounded-md bg-danger-subtle/30 ring-1 ring-inset ring-danger/30 p-3 text-xs"
          data-testid="bulk-failure-list"
        >
          <p className="font-medium text-danger-subtle-fg">
            {errorList.length} reminder{errorList.length === 1 ? "" : "s"} failed:
          </p>
          <ul className="mt-1 space-y-0.5">
            {errorList.map((f) => (
              <li key={f.invoice_id} className="text-fg-muted">
                <span className="font-mono text-[11px]">
                  {f.invoice_id.slice(0, 8)}…
                </span>{" "}
                — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function rowIdsForSendable(
  preview: BulkPreviewData,
  rows: InvoicesBulkRow[],
  selected: Set<string>,
): string[] {
  // The preview lists which selected ids are sendable; we pass the
  // FULL set back to `sendBulkReminders` and let the server re-load
  // each context (covers the race where a row became un-sendable
  // between preview and confirm). The server's sendOne() records
  // any new skips as `failed`.
  void preview;
  void rows;
  return Array.from(selected);
}
