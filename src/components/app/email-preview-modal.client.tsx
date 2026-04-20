"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Post-MVP Sprint 2 + follow-up — email preview modal.
 *
 * Used by:
 *   - invoice detail "Send reminder" (single)
 *   - invoice detail "Issue" (single)
 *   - /invoices bulk reminder action bar (multi)
 *
 * Server actions load rendered HTML + plaintext; the modal displays
 * them and hands confirmation back via `onConfirm`. The caller decides
 * what to do on confirm (typically call the `send*` action).
 *
 * The HTML renders inside an `<iframe srcdoc>` so email styling
 * doesn't leak into the app and vice versa.
 *
 * Bulk mode: the caller now passes the FULL list of per-invoice
 * renders (not just one sample). The modal tracks `currentIndex`
 * internally and exposes Prev / Next controls + ArrowLeft / ArrowRight
 * keyboard shortcuts so admins can spot-check any row before
 * sending. "Send to N" still operates on the full set — per-row
 * navigation is a review affordance, not a filter.
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
  /**
   * Per-invoice rendered previews, one per sendable invoice. Navigation
   * uses array indices; length === sendable_count.
   */
  previews: EmailPreviewData[];
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const bulkPreviews = bulk?.previews ?? [];
  const bulkCount = bulkPreviews.length;
  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= bulkCount - 1;

  // Reset internal view state whenever the modal opens fresh.
  useEffect(() => {
    if (!open) return;
    setCurrentIndex(0);
    setShowPlain(false);
  }, [open]);

  // Keyboard: Escape cancels; Left/Right navigate (bulk only).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (sending) return;
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (bulkCount <= 1) return;
      // Don't hijack arrows while the user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(bulkCount - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, sending, bulkCount]);

  if (!open) return null;

  const activePreview: EmailPreviewData | null = bulk
    ? (bulkPreviews[currentIndex] ?? null)
    : (preview ?? null);

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
            {bulk && bulkCount > 1 ? (
              <span
                className="ml-2 rounded-sm bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted ring-1 ring-border font-numeric"
                data-testid="preview-counter"
                aria-live="polite"
              >
                Preview {currentIndex + 1} of {bulkCount}
              </span>
            ) : null}
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
                Sends to {bulk.sendable_count} of {bulk.total} selected invoice
                {bulk.total === 1 ? "" : "s"}.
              </span>{" "}
              {bulkCount > 1 ? (
                <>Use the arrows (or ← / →) to step through each render.</>
              ) : (
                <>Each invoice renders its own figures at send time.</>
              )}
            </p>
          ) : null}
          {activePreview ? (
            <dl className="grid grid-cols-[80px_1fr] gap-y-1">
              <dt className="text-fg-subtle">To</dt>
              <dd
                className="text-fg break-all"
                data-testid="preview-recipients"
              >
                {activePreview.recipients.join(", ")}
              </dd>
              <dt className="text-fg-subtle">Subject</dt>
              <dd className="text-fg" data-testid="preview-subject">
                {activePreview.subject}
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
          {bulk && bulkCount > 1 ? (
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={atStart || sending}
                aria-label="Previous invoice preview"
                data-testid="preview-prev"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setCurrentIndex((i) => Math.min(bulkCount - 1, i + 1))
                }
                disabled={atEnd || sending}
                aria-label="Next invoice preview"
                data-testid="preview-next"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {activePreview ? (
            showPlain ? (
              <pre
                className="whitespace-pre-wrap p-4 font-mono text-xs text-black"
                data-testid="preview-plain"
              >
                {activePreview.text}
              </pre>
            ) : (
              <iframe
                // srcdoc isolates the email's styles from the app's.
                // Key on (index, showPlain) so toggling tabs or stepping
                // forces a re-render rather than relying on srcDoc diff.
                key={`${bulk ? currentIndex : "single"}-html`}
                srcDoc={activePreview.html}
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
                (bulk ? bulk.sendable_count === 0 : !activePreview)
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
