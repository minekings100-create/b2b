import "server-only";

/**
 * Phase 6 — payment-gateway adapter.
 *
 * Mirrors the email-transport pattern from 3.3.1: one stable interface
 * with a mock (sandbox) implementation that ships today and a real
 * Mollie implementation swappable later behind an env flag. PR-scope
 * decision (see docs/CHANGELOG): adapter-only for v1 so merging
 * doesn't require live Mollie credentials or webhook-signature code.
 *
 * Switching on real Mollie later is a two-step edit:
 *   1. `npm install @mollie/api-client`
 *   2. Replace `mockTransport` in this file with a Mollie-backed one
 *      that calls `client.payments.create({...})`.
 *   3. Add `MOLLIE_API_KEY` + webhook-signature secret to
 *      docs/ENV.md — flagged as a pre-production PAUSE trigger per
 *      Phase 6's gate rules.
 */

export type PaymentCreateInput = {
  /** Amount in cents (never floats) + ISO currency code. */
  amount_cents: number;
  currency: "EUR";
  description: string;
  /** Opaque reference the adapter echoes back on webhook so we can
   *  reconcile by (invoice, payment) regardless of provider id. */
  internal_reference: string;
  /** Full URL the user lands on after paying. */
  redirect_url: string;
  /** Full URL the provider calls to confirm the payment. */
  webhook_url: string;
};

export type PaymentCreateResult = {
  /** Provider payment identifier — stored on `invoices.mollie_payment_id`. */
  provider_payment_id: string;
  /** URL the user is redirected to for payment. In mock mode, this is
   *  a local `/mollie-mock/checkout?...` page; in live mode, a Mollie
   *  checkout URL. */
  checkout_url: string;
  /** Initial status — `open` after creation, flipped by the webhook. */
  status: "open";
};

export type PaymentTransport = {
  name: string;
  create(input: PaymentCreateInput): Promise<PaymentCreateResult>;
};

/**
 * Mock transport — issues a fake provider payment id and returns a
 * local checkout URL (`/mollie-mock/checkout`) where a dev user can
 * simulate paid / failed by clicking a button. The mock page POSTs
 * to the same webhook route a real Mollie call would hit, so the
 * downstream handler gets the same shape.
 */
function mockTransport(): PaymentTransport {
  return {
    name: "mock",
    async create(input) {
      // Mimic Mollie's `tr_xxxxxxxx` shape so downstream code that
      // logs/displays the payment id can't tell mock from live.
      const providerId = `tr_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const params = new URLSearchParams({
        payment_id: providerId,
        amount_cents: String(input.amount_cents),
        description: input.description,
        reference: input.internal_reference,
        redirect: input.redirect_url,
        webhook: input.webhook_url,
      });
      return {
        provider_payment_id: providerId,
        checkout_url: `/mollie-mock/checkout?${params.toString()}`,
        status: "open" as const,
      };
    },
  };
}

let cached: PaymentTransport | null = null;

/**
 * Returns the active transport. Currently always mock; see the
 * module doc for the one-file flip to real Mollie.
 */
export function getPaymentTransport(): PaymentTransport {
  if (!cached) cached = mockTransport();
  return cached;
}

/** Test hook — lets vitest swap in a recording transport. */
export function __setPaymentTransportForTests(
  t: PaymentTransport | null,
): void {
  cached = t;
}
