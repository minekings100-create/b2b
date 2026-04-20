"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Post-MVP Sprint 2 — email preview modal used by:
 *   - invoice detail "Send reminder" (single)
 *   - invoice detail "Issue" (single)
 *   - /invoices bulk reminder action bar
 *
 * Server actions load the rendered HTML + plaintext; the modal just
 * displays them and hands confirmation back to the caller via
 * `onConfirm`. The caller decides what to do on confirm (typically
 * call the `send*` action).
 *
 * The HTML is rendered inside an `<iframe srcdoc>` so external-email
 * styling doesn't leak into the app's stylesheet and vice versa.
 */

export type EmailPreviewData = {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
};

export type BulkPreviewData = {
  total: number;
  sendable_count: number;
  sample: EmailPreviewData | null;
  skipped: Array<{ invoice_id: string; reason: string }>;
};

export function EmailPreviewModal({
  open,
  onCancel,
  onConfirm,
  title,
  preview,
  bulk,
  skipToggle,
  sending,
  sendProgress,
  sendResultSummary,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (opts: { skipNextTime: boolean }) => void;
  title: string;
  /** Single-invoice preview; mutually exclusive with `bulk`. */
  preview?: EmailPreviewData | null;
  /** Bulk preview; mutually exclusive with `preview`. */
  bulk?: BulkPreviewData | null;
  skipToggle?: {
    initial: boolean;
    label?: string;
  };
  sending?: boolean;
  sendProgress?: string | null;
  sendResultSummary?: string | null;
}) {
  const [showPlain, setShowPlain] = useState(false);
  const [skipNext, setSkipNext] = useState(skipToggle?.initial ?? false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Simple ESC to cancel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, sending]);

  if (!open) return null;

  const sample = preview ?? bulk?.sample ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="relative flex h-[min(90vh,800px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-bg ring-1 ring-border shadow-2xl"
        data-testid="email-preview-modal"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-fg-muted" aria-hidden />
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={sending}
            aria-label="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 text-xs">
          {bulk ? (
            <p className="text-fg-muted">
              <span className="font-medium text-fg">
                Applies to {bulk.sendable_count} of {bulk.total} selected invoice
                {bulk.total === 1 ? "" : "s"}.
              </span>{" "}
              Below is a representative sample — the real send renders each
              invoice's own figures (days overdue, amount, recipients).
            </p>
          ) : null}
          {sample ? (
            <dl className="grid grid-cols-[80px_1fr] gap-y-1">
              <dt className="text-fg-subtle">To</dt>
              <dd
                className="text-fg break-all"
                data-testid="preview-recipients"
              >
                {sample.recipients.join(", ")}
              </dd>
              <dt className="text-fg-subtle">Subject</dt>
              <dd className="text-fg" data-testid="preview-subject">
                {sample.subject}
              </dd>
            </dl>
          ) : null}
          {bulk && bulk.skipped.length > 0 ? (
            <details
              className="rounded-md bg-warning-subtle/30 ring-1 ring-inset ring-warning/20 p-2"
              data-testid="preview-skipped"
            >
              <summary className="cursor-pointer text-warning-subtle-fg">
                {bulk.skipped.length} can't be sent — click to see why
              </summary>
              <ul className="mt-2 space-y-1">
                {bulk.skipped.map((s) => (
                  <li key={s.invoice_id} className="text-fg-muted">
                    <span className="font-mono text-[11px]">
                      {s.invoice_id.slice(0, 8)}…
                    </span>{" "}
                    — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => setShowPlain(false)}
            data-active={!showPlain || undefined}
            className="rounded-sm px-2 py-1 text-fg-muted data-[active]:bg-bg data-[active]:text-fg data-[active]:ring-1 data-[active]:ring-border"
          >
            HTML
          </button>
          <button
            type="button"
            onClick={() => setShowPlain(true)}
            data-active={showPlain || undefined}
            className="rounded-sm px-2 py-1 text-fg-muted data-[active]:bg-bg data-[active]:text-fg data-[active]:ring-1 data-[active]:ring-border"
          >
            Plain text
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {sample ? (
            showPlain ? (
              <pre
                className="whitespace-pre-wrap p-4 font-mono text-xs text-black"
                data-testid="preview-plain"
              >
                {sample.text}
              </pre>
            ) : (
              <iframe
                // srcdoc isolates the email's styles from the app's.
                srcDoc={sample.html}
                className="h-full w-full border-0 bg-white"
                title="Email preview"
                data-testid="preview-html"
              />
            )
          ) : (
            <p className="p-4 text-sm text-fg-muted">
              Nothing to preview — no sendable invoices in this selection.
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          {skipToggle ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={skipNext}
                onChange={(e) => setSkipNext(e.target.checked)}
                disabled={sending}
                className="h-3.5 w-3.5 rounded border-border accent-accent"
                data-testid="preview-skip-next"
              />
              {skipToggle.label ?? "Skip preview next time"}
            </label>
          ) : null}
          {sendProgress ? (
            <p className="text-xs text-fg-muted" data-testid="preview-progress">
              {sendProgress}
            </p>
          ) : null}
          {sendResultSummary ? (
            <p
              className="text-xs text-success"
              data-testid="preview-result-summary"
            >
              {sendResultSummary}
            </p>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={sending}
              disabled={
                sending ||
                (bulk ? bulk.sendable_count === 0 : !sample)
              }
              onClick={() => onConfirm({ skipNextTime: skipNext })}
              data-testid="preview-send"
            >
              <Send className="h-3.5 w-3.5" />
              {bulk
                ? `Send to ${bulk.sendable_count} invoice${bulk.sendable_count === 1 ? "" : "s"}`
                : "Send"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
