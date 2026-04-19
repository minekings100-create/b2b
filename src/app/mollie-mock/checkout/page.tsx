import Link from "next/link";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { appBaseUrl } from "@/lib/email/transport";
import { COMPANY } from "@/config/company";

export const metadata = { title: "Mollie (mock) — Checkout" };

/**
 * Phase 6 — mock Mollie checkout screen.
 *
 * Accessed from `payInvoiceWithMollie`'s redirect. The page renders
 * the invoice summary the adapter received and two buttons that POST
 * to the real webhook route with `status=paid` or `status=failed`.
 *
 * The page is purposely obvious about being a mock — nothing here
 * should ship to production. Live Mollie takes over the checkout URL
 * once real credentials land (see `src/lib/payments/transport.ts`).
 *
 * No session required — Mollie hosts its real checkout outside our
 * auth boundary too.
 */
export default function MockCheckoutPage({
  searchParams,
}: {
  searchParams: {
    payment_id?: string;
    amount_cents?: string;
    description?: string;
    reference?: string;
    redirect?: string;
    webhook?: string;
  };
}) {
  const paymentId = searchParams.payment_id ?? "";
  const amountCents = Number.parseInt(searchParams.amount_cents ?? "0", 10);
  const description = searchParams.description ?? "";
  const reference = searchParams.reference ?? "";
  const redirectUrl = searchParams.redirect ?? appBaseUrl();
  const webhookUrl = searchParams.webhook ?? `${appBaseUrl()}/api/webhooks/mollie`;

  const eur = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amountCents / 100);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md space-y-5 rounded-lg bg-surface p-6 ring-1 ring-border">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning-subtle-fg">
            Mock checkout · not a real payment
          </p>
          <h1 className="text-lg font-semibold text-fg">iDEAL (mock)</h1>
          <p className="text-sm text-fg-muted">
            Simulate the Mollie flow — click a button below to fire the
            webhook that a real Mollie would call.
          </p>
        </header>

        <dl className="grid grid-cols-[120px,1fr] gap-y-1 text-sm">
          <dt className="text-fg-subtle">Merchant</dt>
          <dd className="text-fg">{COMPANY.legal_name}</dd>
          <dt className="text-fg-subtle">Description</dt>
          <dd className="font-numeric text-fg">{description || "—"}</dd>
          <dt className="text-fg-subtle">Amount</dt>
          <dd className="font-numeric text-fg">{eur}</dd>
          <dt className="text-fg-subtle">Payment id</dt>
          <dd className="truncate font-numeric text-fg-muted">
            {paymentId || "—"}
          </dd>
        </dl>

        {/* Two separate forms so each button POSTs its own status. The
            action is the real webhook — in mock mode we just skip
            Mollie's signature, which the handler explicitly tolerates
            per the Phase 6 PAUSE rules. */}
        <div className="flex items-center gap-2 pt-2">
          <form
            action={webhookUrl}
            method="POST"
            className="flex-1"
            data-testid="mock-pay-form"
          >
            <input type="hidden" name="payment_id" value={paymentId} />
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="status" value="paid" />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              data-testid="mock-pay-button"
            >
              <Check className="h-4 w-4" />
              Simulate paid
            </Button>
          </form>
          <form action={webhookUrl} method="POST" className="flex-1">
            <input type="hidden" name="payment_id" value={paymentId} />
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="status" value="failed" />
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              data-testid="mock-fail-button"
            >
              <X className="h-4 w-4" />
              Simulate failed
            </Button>
          </form>
        </div>

        <p className="text-xs text-fg-subtle">
          After the webhook fires, return to{" "}
          <Link
            href={redirectUrl}
            className="underline underline-offset-2 hover:text-fg"
          >
            the invoice page
          </Link>{" "}
          to see the updated status.
        </p>
      </div>
    </main>
  );
}
