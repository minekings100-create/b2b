import Link from "next/link";

import { Button } from "@/components/ui/button";
import { COMPANY } from "@/config/company";
import {
  CATEGORY_LABELS,
  FORCED_EMAIL_TRIGGERS,
  TRIGGER_CATEGORY,
} from "@/lib/email/categories";
import { verify } from "@/lib/email/unsubscribe-token";

import { applyUnsubscribe } from "./actions";

export const metadata = {
  title: "Unsubscribe — Procurement",
};

/**
 * 3.3.3a step 5 — unsubscribe confirm page.
 *
 * Reached from a link in every outbound email's footer. Public — the
 * HMAC token's signature authenticates the request; no session required.
 *
 * Three states:
 *   1. No token / invalid / expired → friendly explainer with a link to
 *      /settings/notifications. No stack trace, no leaked reason.
 *   2. Valid token → category name, descriptive copy, a confirm button
 *      (POST → applyUnsubscribe server action), and a Cancel link.
 *   3. Valid token + category contains any FORCED_EMAIL_TRIGGERS → same
 *      as (2) but with a small notice explaining the forced triggers
 *      will keep sending regardless.
 */
export default function UnsubscribeConfirmPage({
  searchParams,
}: {
  searchParams: { t?: string; error?: string };
}) {
  const token = searchParams.t ?? "";
  const hasError = searchParams.error === "invalid";
  const payload = hasError ? null : verify(token);

  if (!payload) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-fg">
          Link expired or invalid
        </h1>
        <p className="text-sm text-fg-muted">
          This unsubscribe link can no longer be used. Manage your email
          preferences from the settings page instead.
        </p>
        <Button asChild variant="secondary">
          <Link href="/settings/notifications">Open settings</Link>
        </Button>
        <FooterLinks />
      </Shell>
    );
  }

  const { label, description } = CATEGORY_LABELS[payload.category];
  const hasForced = FORCED_EMAIL_TRIGGERS.some(
    (trigger) => TRIGGER_CATEGORY[trigger] === payload.category,
  );

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-fg">
        Unsubscribe from {label}
      </h1>
      <p className="text-sm text-fg-muted">{description}</p>

      {hasForced ? (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-fg">
          Some messages in this category are required for financial and
          operational integrity. They will keep being sent even after you
          unsubscribe.
        </p>
      ) : null}

      <form action={applyUnsubscribe} className="flex items-center gap-3 pt-2">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="primary">
          Confirm unsubscribe
        </Button>
        <Link
          href="/settings/notifications"
          className="text-sm text-fg-muted hover:text-fg"
        >
          Cancel
        </Link>
      </form>

      <FooterLinks />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-surface p-6 ring-1 ring-border">
        {children}
      </div>
    </main>
  );
}

function FooterLinks() {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-fg-subtle">
      <span>{COMPANY.legal_name}</span>
      <Link href="/settings/notifications" className="hover:text-fg">
        Manage all preferences →
      </Link>
    </div>
  );
}
