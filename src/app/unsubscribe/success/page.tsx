import Link from "next/link";

import { COMPANY } from "@/config/company";
import {
  CATEGORY_LABELS,
  type NotificationCategory,
} from "@/lib/email/categories";

export const metadata = {
  title: "Unsubscribed — Procurement",
};

/**
 * 3.3.3a step 5 — unsubscribe success page.
 *
 * Reached after `applyUnsubscribe` redirects here with the validated
 * category as the `c` query param. The redirect itself is the proof of
 * success — this page just confirms what changed and offers a
 * resubscribe path via /settings/notifications.
 *
 * Robust to a mangled / absent `c` param: if the value isn't one of the
 * known categories, render a generic confirmation (better than a 4xx —
 * the unsubscribe itself still happened, we just can't personalise the
 * message).
 */
export default function UnsubscribeSuccessPage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const raw = searchParams.c ?? "";
  const category: NotificationCategory | null =
    raw === "state_changes" || raw === "admin_alerts" ? raw : null;
  const label = category ? CATEGORY_LABELS[category].label : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-surface p-6 ring-1 ring-border">
        <h1 className="text-lg font-semibold text-fg">
          You&apos;re unsubscribed
        </h1>
        {label ? (
          <p className="text-sm text-fg-muted">
            You will no longer receive {label.toLowerCase()} emails from{" "}
            {COMPANY.legal_name}.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            Your email preferences have been updated.
          </p>
        )}
        <p className="text-xs text-fg-subtle">
          Changed your mind? Open the settings page to turn them back on.
        </p>
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-fg-subtle">
          <Link
            href="/settings/notifications"
            className="hover:text-fg"
          >
            Manage preferences →
          </Link>
          <span>{COMPANY.legal_name}</span>
        </div>
      </div>
    </main>
  );
}
