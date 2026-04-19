import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Sub-milestone 3.3.3a — /unsubscribe confirm + success flow.
 *
 * Encodes a token inline (mirroring src/lib/email/unsubscribe-token.ts)
 * so the spec doesn't depend on the server-only module's import chain.
 * Seeds prefs before each test; verifies the email bit flips; cleans
 * up afterwards.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET!;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeToken(payload: {
  user_id: string;
  category: "state_changes" | "admin_alerts";
  issued_at: number;
}): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64url(Buffer.from(json, "utf-8"));
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

const FULL_ON = {
  state_changes: { email: true, in_app: true },
  admin_alerts: { email: true, in_app: true },
};

async function userId(email: string): Promise<string> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data!.id;
}

async function resetPrefs(uid: string) {
  await admin
    .from("users")
    .update({ notification_preferences: FULL_ON })
    .eq("id", uid);
}

test.beforeEach(async () => {
  await resetPrefs(await userId("ams.user1@example.nl"));
});
test.afterAll(async () => {
  await resetPrefs(await userId("ams.user1@example.nl"));
});

test.describe("3.3.3a /unsubscribe flow", () => {
  test("valid token renders category label, confirm flips email bit + audit row", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    const token = encodeToken({
      user_id: uid,
      category: "state_changes",
      issued_at: Math.floor(Date.now() / 1000),
    });

    await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);
    await expect(
      page.getByRole("heading", { name: /unsubscribe from order updates/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /confirm unsubscribe/i }).click();
    await expect(page).toHaveURL(/\/unsubscribe\/success\?c=state_changes/);
    await expect(
      page.getByRole("heading", { name: /you'?re unsubscribed/i }),
    ).toBeVisible();

    // DB flipped — email false, in_app preserved, admin_alerts untouched.
    const { data } = await admin
      .from("users")
      .select("notification_preferences")
      .eq("id", uid)
      .single();
    const prefs = data!.notification_preferences as typeof FULL_ON;
    expect(prefs.state_changes.email).toBe(false);
    expect(prefs.state_changes.in_app).toBe(true);
    expect(prefs.admin_alerts.email).toBe(true);
    expect(prefs.admin_alerts.in_app).toBe(true);

    // Audit row present with source='email_link'.
    await expect
      .poll(
        async () => {
          const { data: rows } = await admin
            .from("audit_log")
            .select("action, after_json")
            .eq("actor_user_id", uid)
            .eq("action", "notification_preferences_updated")
            .order("created_at", { ascending: false })
            .limit(1);
          return (rows?.[0]?.after_json as { source?: string })?.source ?? null;
        },
        { timeout: 5_000 },
      )
      .toBe("email_link");
  });

  test("garbage token shows the invalid-link explainer", async ({ page }) => {
    await page.goto("/unsubscribe?t=garbage");
    await expect(
      page.getByRole("heading", { name: /expired or invalid/i }),
    ).toBeVisible();
  });

  test("forced-category token shows the 'some messages keep sending' notice", async ({
    page,
  }) => {
    const uid = await userId("ams.user1@example.nl");
    const token = encodeToken({
      user_id: uid,
      category: "admin_alerts",
      issued_at: Math.floor(Date.now() / 1000),
    });
    await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);
    await expect(
      page.getByText(/keep being sent even after you unsubscribe/i),
    ).toBeVisible();
  });
});
