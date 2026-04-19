import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decode,
  encode,
  verify,
  type UnsubscribeTokenPayload,
} from "@/lib/email/unsubscribe-token";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * 3.3.3a step 4 — HMAC unsubscribe-token contract tests.
 *
 * The helper is pure logic + process.env — deterministic given a frozen
 * clock. Each test resets vi.useRealTimers in afterEach so no time-travel
 * leaks between cases.
 */

const CAT_STATE = "state_changes" as const;
const CAT_ADMIN = "admin_alerts" as const;

function basePayload(
  overrides: Partial<UnsubscribeTokenPayload> = {},
): UnsubscribeTokenPayload {
  return {
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    category: CAT_STATE,
    issued_at: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("encode → decode roundtrip", () => {
  it("preserves the exact payload", () => {
    const payload = basePayload();
    const token = encode(payload);
    const res = decode(token);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.payload).toEqual(payload);
  });

  it("encodes both categories round-trip-equal", () => {
    for (const category of [CAT_STATE, CAT_ADMIN] as const) {
      const payload = basePayload({ category });
      const res = decode(encode(payload));
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.payload.category).toBe(category);
    }
  });

  it("verify() returns the payload on a valid token", () => {
    const payload = basePayload();
    expect(verify(encode(payload))).toEqual(payload);
  });
});

describe("expiry", () => {
  it("rejects a token older than MAX_AGE (60 days)", () => {
    // Freeze clock at a known epoch, issue a token "61 days ago", verify
    // fails with `expired`. Exactly 60 days is on the boundary — use 61
    // to avoid ambiguity with floor() rounding.
    const now = 1_800_000_000; // 2027-01-15
    vi.setSystemTime(new Date(now * 1000));
    const token = encode(
      basePayload({ issued_at: now - 61 * 24 * 60 * 60 }),
    );
    const res = decode(token);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("expired");
    expect(verify(token)).toBeNull();
  });

  it("accepts a token issued inside the window", () => {
    const now = 1_800_000_000;
    vi.setSystemTime(new Date(now * 1000));
    // 30 days old — well inside MAX_AGE.
    const token = encode(
      basePayload({ issued_at: now - 30 * 24 * 60 * 60 }),
    );
    expect(decode(token).ok).toBe(true);
  });
});

describe("clock skew tolerance", () => {
  it("accepts issued_at up to 5 minutes in the future (within FUTURE_SKEW)", () => {
    const now = 1_800_000_000;
    vi.setSystemTime(new Date(now * 1000));
    // 4 minutes ahead — inside skew window.
    const token = encode(basePayload({ issued_at: now + 4 * 60 }));
    expect(decode(token).ok).toBe(true);
  });

  it("rejects issued_at more than 5 minutes in the future", () => {
    const now = 1_800_000_000;
    vi.setSystemTime(new Date(now * 1000));
    // 6 minutes ahead — past the skew window.
    const token = encode(basePayload({ issued_at: now + 6 * 60 }));
    const res = decode(token);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("future_issued_at");
  });
});

describe("tampering rejection", () => {
  it("rejects a token with a tampered payload but original signature", () => {
    // Issue a state_changes token, then rewrite the payload to
    // admin_alerts and keep the old signature — the HMAC must not match.
    const good = encode(basePayload({ category: CAT_STATE }));
    const [, sig] = good.split(".");
    const forgedPayload = b64url(
      Buffer.from(
        JSON.stringify(basePayload({ category: CAT_ADMIN })),
        "utf-8",
      ),
    );
    const forged = `${forgedPayload}.${sig}`;
    const res = decode(forged);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("bad_signature");
  });

  it("rejects a token with a mutated signature byte", () => {
    const good = encode(basePayload());
    const [payload, sig] = good.split(".");
    // Flip one character of the signature — any single-char change in a
    // base64url string produces a different decoded byte sequence.
    const firstCharReplacement = sig![0] === "A" ? "B" : "A";
    const mutated = `${payload}.${firstCharReplacement}${sig!.slice(1)}`;
    const res = decode(mutated);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("bad_signature");
  });
});

describe("malformed input", () => {
  it("rejects an empty string", () => {
    const res = decode("");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("malformed");
  });

  it("rejects a token with no dot separator", () => {
    const res = decode("not-a-valid-token-just-random-base64url");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("malformed");
  });

  it("rejects a token with too many parts", () => {
    const res = decode("a.b.c");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("malformed");
  });

  it("rejects a token whose payload isn't valid base64url JSON", () => {
    // Real signature over literal "not-json" — signature passes, JSON
    // parse fails → bad_payload (distinct from bad_signature).
    const payloadB64 = b64url(Buffer.from("not-json", "utf-8"));
    const sigB64 = b64url(
      createHmac("sha256", process.env.UNSUBSCRIBE_TOKEN_SECRET!)
        .update(payloadB64)
        .digest(),
    );
    const res = decode(`${payloadB64}.${sigB64}`);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("bad_payload");
  });

  it("rejects a token whose category isn't one of the known values", () => {
    // Forge a payload with an unknown category, sign it with the real
    // secret so signature check passes. The category whitelist then
    // rejects it as bad_payload.
    const payload = {
      user_id: basePayload().user_id,
      category: "marketing", // not in the NotificationCategory union
      issued_at: Math.floor(Date.now() / 1000),
    };
    const payloadB64 = b64url(
      Buffer.from(JSON.stringify(payload), "utf-8"),
    );
    const sigB64 = b64url(
      createHmac("sha256", process.env.UNSUBSCRIBE_TOKEN_SECRET!)
        .update(payloadB64)
        .digest(),
    );
    const res = decode(`${payloadB64}.${sigB64}`);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("bad_payload");
  });
});

describe("wrong secret rejection", () => {
  // The helper reads UNSUBSCRIBE_TOKEN_SECRET on every HMAC call. Swap
  // the env var mid-test to simulate a verifier that doesn't share the
  // issuer's secret (e.g. post-rotation).
  const realSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET;

  beforeEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = realSecret;
  });

  it("rejects a token when the verifier's secret differs from the issuer's", () => {
    const token = encode(basePayload());
    // Rotate the secret — the token's signature now comes from a key
    // the verifier no longer holds.
    process.env.UNSUBSCRIBE_TOKEN_SECRET = "a-different-secret-post-rotation";
    const res = decode(token);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("bad_signature");
  });

  it("throws if UNSUBSCRIBE_TOKEN_SECRET is unset", () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    expect(() => encode(basePayload())).toThrow(/UNSUBSCRIBE_TOKEN_SECRET/);
    expect(() => decode("a.b")).toThrow(/UNSUBSCRIBE_TOKEN_SECRET/);
  });
});
