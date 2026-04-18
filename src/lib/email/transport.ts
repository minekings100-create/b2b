import "server-only";

/**
 * Email transport adapter (SPEC §2 — Resend, with adapter pattern so SendGrid
 * is a drop-in replacement). Sub-milestone 3.3.1 ships in **console-only
 * mode** — no Resend client is constructed and no API key is required. The
 * `notifications` table still gets a row per recipient so 3.3.2's bell has
 * data to render.
 *
 * Switching on real Resend later is a single edit:
 *   1. `npm install resend`
 *   2. Replace the `consoleTransport` factory below with one that calls
 *      `new Resend(process.env.RESEND_API_KEY).emails.send(...)`.
 *   3. Set `RESEND_API_KEY` (+ `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`) in
 *      the Vercel project. See /docs/ENV.md.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable identifier used by the `notifications` table + analytics. */
  type: string;
  /** Render-friendly payload mirrored to the `notifications` row. */
  payload?: Record<string, unknown>;
};

export type EmailTransport = {
  name: string;
  send(message: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }>;
};

function consoleTransport(): EmailTransport {
  return {
    name: "console",
    async send(message) {
      // eslint-disable-next-line no-console
      console.log(
        `[email:console] type=${message.type} to=${message.to} subject="${message.subject}"`,
      );
      // eslint-disable-next-line no-console
      console.log(`[email:console] text:\n${message.text}`);
      return { ok: true };
    },
  };
}

let cached: EmailTransport | null = null;

/**
 * Returns the active transport. Currently always console — gate intentionally
 * inverted: even if `RESEND_API_KEY` is set we still no-op until the Resend
 * client + sender domain is wired (Phase 3.3.x or later, when the user opts in).
 */
export function getEmailTransport(): EmailTransport {
  if (!cached) cached = consoleTransport();
  return cached;
}

/** Test-only hook — lets vitest swap a recording transport in. */
export function __setEmailTransportForTests(t: EmailTransport | null): void {
  cached = t;
}

/**
 * Stable address for outbound mail. Resend has no opinion on the From line
 * yet; we centralise it here so 3.3.3's polished templates pull from one
 * source. `RESEND_FROM_EMAIL` overrides; the default is the Resend sandbox
 * sender so dev never blocks on domain verification.
 */
export function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ??
    "Procurement (dev) <onboarding@resend.dev>"
  );
}

/** Base URL used to build `View order →` style CTAs. */
export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
