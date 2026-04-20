"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { BranchArchiveInput } from "@/lib/validation/branch";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 7b-2b — branch archive / restore actions.
 *
 * The UPDATE goes through the admin (service-role) client. RLS on
 * `branches` rejects column-level updates to `deleted_at` from the
 * session client even for super_admin — verified empirically; other
 * column updates (name, email, active) work fine. Rather than
 * loosen the policy (which affects every branch write surface),
 * the action uses the admin client for the soft-delete write and
 * relies on the `isAdmin(session.roles)` gate at the top as the
 * security boundary. The audit row is still written via the session
 * client so actor_user_id is the authenticated user, not service role.
 */

export type BranchFormState =
  | { error: string }
  | { success: true; id: string }
  | undefined;

export async function archiveBranch(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = BranchArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("branches")
    .select("branch_code, name, active, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Branch not found" };
  if (prior.deleted_at !== null) return { error: "Branch already archived" };

  const { error } = await adm
    .from("branches")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "branch",
    entity_id: parsed.data.id,
    action: "archive",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { active: false, deleted_at: "<now>" } as Json,
  });

  revalidatePath("/branches");
  return { success: true, id: parsed.data.id };
}

export async function restoreBranch(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = BranchArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("branches")
    .select("branch_code, name, active, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Branch not found" };
  if (prior.deleted_at === null) return { error: "Branch is not archived" };

  const { error } = await adm
    .from("branches")
    .update({ active: true, deleted_at: null })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "branch",
    entity_id: parsed.data.id,
    action: "restore",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { active: true, deleted_at: null } as Json,
  });

  revalidatePath("/branches");
  return { success: true, id: parsed.data.id };
}
