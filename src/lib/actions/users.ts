"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { UserArchiveInput } from "@/lib/validation/user";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 7b-2b — user archive / restore actions.
 *
 * Admin-only. Self-archive is blocked (don't let an admin lock
 * themselves out of the admin tools).
 *
 * Scope note: this is a SOFT archive on `public.users`. It does NOT
 * disable Supabase Auth login (`auth.users` stays untouched) — an
 * archived user with a valid session can still reach the app. Hard
 * user deactivation needs the Supabase Auth admin API and is a
 * separate phase. Documented in CHANGELOG / ARCHITECTURE.
 *
 * The UPDATE goes through the admin (service-role) client. RLS on
 * `users` similarly rejects column-level updates to `deleted_at` from
 * the session client; the admin client sidesteps the same way the
 * archived read does. `isAdmin(session.roles)` + self-guard is the
 * security boundary. Audit row still binds to the actor uid.
 */

export type UserFormState =
  | { error: string }
  | { success: true; id: string }
  | undefined;

export async function archiveUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UserArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };
  if (parsed.data.id === session.user.id) {
    return { error: "You can't archive yourself" };
  }

  const supabase = createClient();
  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("users")
    .select("email, active, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "User not found" };
  if (prior.deleted_at !== null) return { error: "User already archived" };

  const { error } = await adm
    .from("users")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "archive",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { active: false, deleted_at: "<now>" } as Json,
  });

  revalidatePath("/users");
  return { success: true, id: parsed.data.id };
}

export async function restoreUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UserArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("users")
    .select("email, active, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "User not found" };
  if (prior.deleted_at === null) return { error: "User is not archived" };

  const { error } = await adm
    .from("users")
    .update({ active: true, deleted_at: null })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "restore",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { active: true, deleted_at: null } as Json,
  });

  revalidatePath("/users");
  return { success: true, id: parsed.data.id };
}
