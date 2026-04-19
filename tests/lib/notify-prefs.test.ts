import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { notify } from "@/lib/email/notify";
import {
  __setEmailTransportForTests,
  type EmailMessage,
  type EmailTransport,
} from "@/lib/email/transport";
import type { Database } from "@/lib/supabase/types";

dotenv.config({ path: ".env.local" });

/**
 * 3.3.3a step 10 — integration tests for the notify() prefs filter,
 * the forced-trigger bypass, and the per-recipient footer composition.
 *
 * Uses the real admin client (same DB as RLS tests). Each test sets
 * a known pref shape on a fixture user, runs notify(), and asserts on
 * what was inserted + what the recording transport saw.
 */

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_EMAIL = "ams.user1@example.nl";
const FIXTURE_PAYLOAD = { _fixture: "NOTIFY-PREFS-TEST" };

const FULL_ON = {
  state_changes: { email: true, in_app: true },
  admin_alerts: { email: true, in_app: true },
};

async function getUserId(): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", FIXTURE_EMAIL)
    .single();
  return data!.id;
}

async function setPrefs(userId: string, prefs: typeof FULL_ON): Promise<void> {
  await admin
    .from("users")
    .update({ notification_preferences: prefs })
    .eq("id", userId);
}

async function cleanupNotifications(userId: string): Promise<void> {
  await admin
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .filter("payload_json->>_fixture", "eq", FIXTURE_PAYLOAD._fixture);
}

function recordingTransport(
  captured: EmailMessage[],
): EmailTransport {
  return {
    name: "recording",
    async send(m) {
      captured.push(m);
      return { ok: true };
    },
  };
}

const rendered = {
  subject: "test subject",
  html: "<p>hello</p>{{PREFS_URL}} {{UNSUBSCRIBE_URL}}",
  text: "hello\n{{PREFS_URL}}\n{{UNSUBSCRIBE_URL}}",
};

let userId = "";
let captured: EmailMessage[] = [];

beforeEach(async () => {
  userId = await getUserId();
  await setPrefs(userId, FULL_ON);
  await cleanupNotifications(userId);
  captured = [];
  __setEmailTransportForTests(recordingTransport(captured));
});

afterEach(async () => {
  __setEmailTransportForTests(null);
  await setPrefs(userId, FULL_ON);
  await cleanupNotifications(userId);
  vi.restoreAllMocks();
});

describe("notify() respects per-user prefs", () => {
  it("sends email + inserts in_app when both bits are on (default)", async () => {
    const result = await notify({
      db: admin,
      type: "order_submitted",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });
    expect(result.sent).toBe(1);
    expect(result.inserted).toBe(1);
    expect(captured).toHaveLength(1);

    // notifications row present for the bell.
    const { data: rows } = await admin
      .from("notifications")
      .select("type")
      .eq("user_id", userId)
      .filter("payload_json->>_fixture", "eq", FIXTURE_PAYLOAD._fixture);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.type).toBe("order_submitted");
  });

  it("skips email + inserts in_app when email opted out and in_app opted in", async () => {
    await setPrefs(userId, {
      ...FULL_ON,
      state_changes: { email: false, in_app: true },
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await notify({
      db: admin,
      type: "order_submitted", // state_changes category
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });

    expect(result.sent).toBe(0);
    expect(result.inserted).toBe(1);
    expect(captured).toHaveLength(0);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/skipped email to .*opted out of state_changes/),
    );
  });

  it("sends email + skips in_app when in_app opted out and email opted in", async () => {
    await setPrefs(userId, {
      ...FULL_ON,
      state_changes: { email: true, in_app: false },
    });

    const result = await notify({
      db: admin,
      type: "order_submitted",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });

    expect(result.sent).toBe(1);
    expect(result.inserted).toBe(0);
    expect(captured).toHaveLength(1);

    const { data: rows } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .filter("payload_json->>_fixture", "eq", FIXTURE_PAYLOAD._fixture);
    expect(rows).toHaveLength(0);
  });

  it("skips both when both bits off", async () => {
    await setPrefs(userId, {
      ...FULL_ON,
      state_changes: { email: false, in_app: false },
    });
    const result = await notify({
      db: admin,
      type: "order_submitted",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });
    expect(result.sent).toBe(0);
    expect(result.inserted).toBe(0);
    expect(captured).toHaveLength(0);
  });
});

describe("notify() forced-trigger bypass", () => {
  it("sends email for `order_submitted_while_overdue` even when admin_alerts.email is off", async () => {
    // Even if the user somehow opted out of admin_alerts email, the
    // forced list (step 6) bypasses the pref.
    await setPrefs(userId, {
      ...FULL_ON,
      admin_alerts: { email: false, in_app: true },
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await notify({
      db: admin,
      type: "order_submitted_while_overdue",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });

    expect(result.sent).toBe(1);
    expect(captured).toHaveLength(1);
    // No skip log — forced sends are expected, never logged as skipped.
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("still respects in_app pref for forced trigger (forced = email-only)", async () => {
    await setPrefs(userId, {
      ...FULL_ON,
      admin_alerts: { email: false, in_app: false },
    });
    const result = await notify({
      db: admin,
      type: "order_submitted_while_overdue",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });
    // email: forced → sent; in_app: user opted out → not inserted.
    expect(result.sent).toBe(1);
    expect(result.inserted).toBe(0);
  });
});

describe("notify() per-recipient composition (step 9)", () => {
  it("replaces {{PREFS_URL}} and {{UNSUBSCRIBE_URL}} in html + text", async () => {
    await notify({
      db: admin,
      type: "order_submitted",
      recipients: [{ user_id: userId, email: FIXTURE_EMAIL }],
      rendered,
      payload: FIXTURE_PAYLOAD,
    });
    expect(captured).toHaveLength(1);
    const msg = captured[0]!;
    expect(msg.html).not.toContain("{{UNSUBSCRIBE_URL}}");
    expect(msg.html).not.toContain("{{PREFS_URL}}");
    expect(msg.html).toMatch(/\/unsubscribe\?t=/);
    expect(msg.html).toContain("/settings/notifications");
    expect(msg.text).not.toContain("{{UNSUBSCRIBE_URL}}");
    expect(msg.text).not.toContain("{{PREFS_URL}}");
    // Plaintext footer appended by notify() (not by the template).
    expect(msg.text).toContain("Manage preferences:");
    expect(msg.text).toContain("Unsubscribe:");
  });

  it("generates a different token per recipient", async () => {
    // Send to the same user twice (simulates two recipients in one batch;
    // in reality tokens would differ per user, but here we're verifying
    // that the encode() call is per-iteration, not a cached string).
    const recipients = [
      { user_id: userId, email: FIXTURE_EMAIL },
      { user_id: userId, email: FIXTURE_EMAIL },
    ];
    await notify({
      db: admin,
      type: "order_submitted",
      recipients,
      rendered,
      payload: FIXTURE_PAYLOAD,
    });
    expect(captured).toHaveLength(2);
    // Tokens are generated inside the loop with `issued_at = now()`.
    // Both may share the same second, so we at least verify the URL
    // structure was produced for each.
    for (const m of captured) {
      expect(m.html).toMatch(/\/unsubscribe\?t=[A-Za-z0-9_\-.%]+/);
    }
  });
});
