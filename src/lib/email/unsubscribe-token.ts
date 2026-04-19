import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { NotificationCategory } from "./categories";

/**
 * 3.3.3a step 4 — HMAC-signed unsubscribe tokens.
 *
 * Embedded in every outbound email's footer as `/unsubscribe?t=<token>`.
 * The token encodes which preference the user is flipping (user_id +
 * category) and when the email was issued, signed with a server secret.
 *
 * Format: `<base64url(json(payload))>.<base64url(hmac-sha256)>`
 *
 * Why HMAC and not a DB-stored one-shot token:
 *   - Every email carries a fresh link; no mutable state to manage.
 *   - No DB round-trip to validate — `/unsubscribe` can render its
 *     confirmation page without a query.
 *   - Invalidation is global: rotate `UNSUBSCRIBE_TOKEN_SECRET` and
 *     every in-flight token dies. Issue another email if you need to.
 *
 * Validity window:
 *   - MAX_AGE = 60 days. Digest reminders and rejections often sit
 *     unread for weeks; 60 days lets a motivated recipient dig up an
 *     old email and still unsubscribe, short enough to bound exposure
 *     if the secret is compromised.
 *   - FUTURE_SKEW = 5 min. Rejects tokens whose `issued_at` is more
 *     than five minutes in the future. Usually no skew at all (Vercel
 *     issuer + verifier share NTP), but a dev running locally against
 *     a prod-issued token may have a drifted clock.
 *
 * Token is NOT single-use. The same token survives multiple visits —
 * useful if the user double-clicks or opens in two tabs. The server
 * action that flips the preference is idempotent.
 */

const MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 days
const FUTURE_SKEW_SECONDS = 5 * 60; // 5 minutes

function secret(): Buffer {
  const raw = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!raw) {
    throw new Error(
      "UNSUBSCRIBE_TOKEN_SECRET env var is required to sign / verify " +
        "unsubscribe tokens. See docs/ENV.md.",
    );
  }
  return Buffer.from(raw, "utf-8");
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function hmac(message: string): Buffer {
  return createHmac("sha256", secret()).update(message).digest();
}

export type UnsubscribeTokenPayload = {
  user_id: string;
  category: NotificationCategory;
  /** Unix seconds. */
  issued_at: number;
};

export function encode(payload: UnsubscribeTokenPayload): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(json, "utf-8"));
  const sig = hmac(payloadB64);
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export type DecodeFailure =
  | "malformed"
  | "bad_signature"
  | "bad_payload"
  | "expired"
  | "future_issued_at";

export type DecodeResult =
  | { ok: true; payload: UnsubscribeTokenPayload }
  | { ok: false; reason: DecodeFailure };

/**
 * Full decode — parses, verifies signature, checks the issued-at window,
 * and returns a discriminated result. Use this when the caller wants
 * to differentiate between failure modes (e.g. logging / metrics).
 */
export function decode(token: string): DecodeResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  // parts is [string, string] after the length guard, but destructuring
  // doesn't narrow that to the TS compiler under noUncheckedIndexedAccess.
  const payloadB64 = parts[0] as string;
  const sigB64 = parts[1] as string;

  // Signature first — constant-time compare, no payload parsing yet.
  const expectedSig = hmac(payloadB64);
  const gotSig = b64urlDecode(sigB64);
  if (
    gotSig.length !== expectedSig.length ||
    !timingSafeEqual(gotSig, expectedSig)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  // Payload shape.
  let raw: unknown;
  try {
    raw = JSON.parse(b64urlDecode(payloadB64).toString("utf-8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as { user_id?: unknown }).user_id !== "string" ||
    typeof (raw as { category?: unknown }).category !== "string" ||
    typeof (raw as { issued_at?: unknown }).issued_at !== "number"
  ) {
    return { ok: false, reason: "bad_payload" };
  }
  const p = raw as UnsubscribeTokenPayload;
  if (p.category !== "state_changes" && p.category !== "admin_alerts") {
    return { ok: false, reason: "bad_payload" };
  }

  // Age / clock window.
  const now = Math.floor(Date.now() / 1000);
  if (p.issued_at - now > FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: "future_issued_at" };
  }
  if (now - p.issued_at > MAX_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: p };
}

/**
 * Convenience — validated payload or `null` on any failure. Use in the
 * unsubscribe page / server action, which renders one "invalid or
 * expired link" UX regardless of which failure mode tripped.
 */
export function verify(token: string): UnsubscribeTokenPayload | null {
  const res = decode(token);
  return res.ok ? res.payload : null;
}
