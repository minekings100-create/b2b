"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { NotificationCategory } from "@/lib/email/categories";
import { verify } from "@/lib/email/unsubscribe-token";

/**
 * 3.3.3a step 5 — unsubscribe server action.
 *
 * Verifies the HMAC token, flips
 * `users.notification_preferences[category].email` to `false`, and
 * redirects to the success page. Uses the service-role admin client:
 * unsubscribe requests typically arrive without a session (user clicked
 * an email link from a browser that isn't signed in) — the token's
 * signature IS the authentication.
 *
 * Idempotent. Re-submitting the same token after the bit is already
 * false is a no-op at the data layer and still redirects to the success
 * page. The token is NOT invalidated on use (see unsubscribe-token.ts).
 *
 * Any failure mode — malformed input, invalid/expired token, missing
 * user row, DB error — redirects back to `/unsubscribe?error=invalid`
 * so the confirm page can render a single "expired or invalid" UX. We
 * intentionally do NOT leak the specific reason to the user (signal
 * hiding doesn't help legitimate users and slows link-scraping bots a
 * little).
 *
 * Audit logging is step 8 of the 3.3.3a work order — a TODO marks the
 * spot below. Intentionally NOT wired yet so this step stays bounded.
 */

const InputSchema = z.object({
  token: z.string().min(1),
});

type PrefShape = Record<
  NotificationCategory,
  { email: boolean; in_app: boolean }
>;

export async function applyUnsubscribe(formData: FormData): Promise<void> {
  const parsed = InputSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    redirect("/unsubscribe?error=invalid");
  }

  const payload = verify(parsed.data.token);
  if (!payload) {
    redirect("/unsubscribe?error=invalid");
  }

  const admin = createAdminClient();

  const { data: row, error: readErr } = await admin
    .from("users")
    .select("notification_preferences, deleted_at")
    .eq("id", payload.user_id)
    .maybeSingle();
  if (readErr || !row || row.deleted_at) {
    redirect("/unsubscribe?error=invalid");
  }

  const currentPrefs = (row.notification_preferences ?? {}) as PrefShape;
  const nextPrefs: PrefShape = {
    ...currentPrefs,
    [payload.category]: {
      // Preserve in_app; only flip email. `?? true` covers the (unlikely)
      // case that a prior write left the sibling undefined — treat it as
      // the permissive default rather than silently off.
      in_app: currentPrefs[payload.category]?.in_app ?? true,
      email: false,
    },
  };

  const { error: updateErr } = await admin
    .from("users")
    .update({ notification_preferences: nextPrefs as unknown as Json })
    .eq("id", payload.user_id);
  if (updateErr) {
    redirect("/unsubscribe?error=invalid");
  }

  // Audit trail. Single action `notification_preferences_updated` with
  // full before/after shapes in JSON — matches the repo's one-row-per-
  // user-action pattern. `source` discriminator separates email-link
  // clicks from the settings-page path. Skip when nothing actually
  // changed (idempotent re-submit).
  const beforeEmail = currentPrefs[payload.category]?.email;
  const afterEmail = nextPrefs[payload.category].email;
  if (beforeEmail !== afterEmail) {
    await admin.from("audit_log").insert({
      entity_type: "user",
      entity_id: payload.user_id,
      action: "notification_preferences_updated",
      actor_user_id: payload.user_id,
      before_json: { preferences: currentPrefs } as unknown as Json,
      after_json: {
        preferences: nextPrefs,
        source: "email_link",
      } as unknown as Json,
    });
  }

  redirect(`/unsubscribe/success?c=${encodeURIComponent(payload.category)}`);
}
