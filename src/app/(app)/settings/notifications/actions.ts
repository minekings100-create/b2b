"use server";

import { revalidatePath } from "next/cache";

import { getUserWithRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  FORCED_EMAIL_TRIGGERS,
  TRIGGER_CATEGORY,
  type NotificationCategory,
  type NotificationChannel,
} from "@/lib/email/categories";

/**
 * 3.3.3a step 7 — save-preferences server action.
 *
 * Atomic multi-bit update: up to 4 checkboxes per submit. Mirrors the
 * spread-merge discipline from `applyUnsubscribe` (step 5, actions.ts),
 * extended to flip 0–4 bits in one write.
 *
 * Forced-email channels (`FORCED_EMAIL_TRIGGERS` / `TRIGGER_CATEGORY`)
 * are preserved server-side regardless of what the form submits. The
 * UI disables the matching checkbox, but the server is the source of
 * truth — a crafted POST that flips a forced bit is ignored here.
 *
 * Runs under the user's session client (not the admin client). The
 * RLS policy `users_update_self` (foundation_rls migration) allows the
 * user to update their own row.
 *
 * Single user-facing error on any failure. No leaked reason codes.
 *
 * Audit logging is step 8 of the 3.3.3a work order — a TODO marks
 * the spot below. Intentionally NOT wired yet so this step stays
 * bounded.
 */

export type PreferencesState =
  | { success: true }
  | { error: "save_failed" }
  | undefined;

type PrefShape = Record<
  NotificationCategory,
  { email: boolean; in_app: boolean }
>;

const CATEGORIES: readonly NotificationCategory[] = [
  "state_changes",
  "admin_alerts",
];
const CHANNELS: readonly NotificationChannel[] = ["email", "in_app"];

function isEmailForced(cat: NotificationCategory): boolean {
  return FORCED_EMAIL_TRIGGERS.some(
    (trigger) => TRIGGER_CATEGORY[trigger] === cat,
  );
}

export async function savePreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const session = await getUserWithRoles();
  if (!session) return { error: "save_failed" };

  const supabase = createClient();

  const { data: row, error: readErr } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", session.user.id)
    .maybeSingle();
  if (readErr || !row) return { error: "save_failed" };

  const existing = (row.notification_preferences ?? {}) as PrefShape;

  // Build the next shape by iterating the known taxonomy. Checkboxes
  // only submit a value when checked, so "field absent" = unchecked.
  // For forced channels, preserve the existing bit verbatim — the UI
  // disables the checkbox so nothing should be submitted for it, but
  // preserve-on-the-server guards against a crafted POST.
  const next: PrefShape = {
    state_changes: { email: true, in_app: true },
    admin_alerts: { email: true, in_app: true },
  };
  for (const cat of CATEGORIES) {
    for (const chan of CHANNELS) {
      if (chan === "email" && isEmailForced(cat)) {
        // Preserve ?? true permissive fallback if the stored shape is
        // somehow incomplete (shouldn't happen per migration default).
        next[cat][chan] = existing[cat]?.[chan] ?? true;
        continue;
      }
      next[cat][chan] = formData.has(`${cat}.${chan}`);
    }
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ notification_preferences: next as unknown as Json })
    .eq("id", session.user.id);
  if (updateErr) return { error: "save_failed" };

  // Audit trail. Mirrors the /unsubscribe flow — single action name
  // with full before/after shapes in JSON, `source` discriminator, and
  // a skip when nothing changed. Running under the user's session
  // client; the `audit_log_insert` policy allows `actor_user_id =
  // auth.uid()` so no admin client needed.
  if (!prefsEqual(existing, next)) {
    await supabase.from("audit_log").insert({
      entity_type: "user",
      entity_id: session.user.id,
      action: "notification_preferences_updated",
      actor_user_id: session.user.id,
      before_json: { preferences: existing } as unknown as Json,
      after_json: {
        preferences: next,
        source: "settings_page",
      } as unknown as Json,
    });
  }

  revalidatePath("/settings/notifications");
  return { success: true };
}

function prefsEqual(a: PrefShape, b: PrefShape): boolean {
  for (const cat of CATEGORIES) {
    for (const chan of CHANNELS) {
      if (a[cat]?.[chan] !== b[cat]?.[chan]) return false;
    }
  }
  return true;
}
