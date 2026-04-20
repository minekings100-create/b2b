"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 3 — first-login welcome overlay dismissal. Stamps
 * `users.welcome_dismissed_at` with NOW() so the card never shows for
 * this user again. Audited so admins can reconstruct onboarding
 * completion if ever needed.
 */
export async function dismissWelcome(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = await getUserWithRoles();
  if (!session) return { ok: false, reason: "Not signed in" };

  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({ welcome_dismissed_at: now })
    .eq("id", session.user.id)
    .is("welcome_dismissed_at", null);
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: session.user.id,
    action: "welcome_dismissed",
    actor_user_id: session.user.id,
    before_json: { welcome_dismissed_at: null } as Json,
    after_json: { welcome_dismissed_at: now } as Json,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
