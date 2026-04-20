import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 1 — guard against leaving the system with zero
 * super_admins who can actually sign in.
 *
 * An assignment only counts if ALL of:
 *   - `user_branch_roles.role = 'super_admin'`
 *   - `user_branch_roles.deleted_at IS NULL`
 *   - the owning `public.users` row has `deleted_at IS NULL`
 *   - the owning `public.users` row has `login_disabled = false`
 *
 * Called before:
 *   - `removeRole` — would remove a super_admin role assignment
 *   - `deactivateLogin` — would flip a super_admin's `login_disabled` to true
 *
 * Uses the admin client: the guard must be honest regardless of the
 * caller's RLS view of `user_branch_roles`.
 */

type ActiveSuperAdmin = { user_id: string };

async function loadActiveSuperAdmins(
  adm: SupabaseClient<Database>,
): Promise<ActiveSuperAdmin[]> {
  const { data, error } = await adm
    .from("user_branch_roles")
    .select("user_id, users!inner(login_disabled, deleted_at)")
    .eq("role", "super_admin")
    .is("deleted_at", null);
  if (error) throw error;
  type Row = {
    user_id: string;
    users: { login_disabled: boolean; deleted_at: string | null };
  };
  return ((data ?? []) as unknown as Row[])
    .filter(
      (r) => r.users.deleted_at === null && r.users.login_disabled === false,
    )
    .map((r) => ({ user_id: r.user_id }));
}

export async function wouldLeaveZeroSuperAdmins(
  adm: SupabaseClient<Database>,
  opts:
    | { type: "remove_role"; user_id: string; role_row_id: string }
    | { type: "deactivate_login"; user_id: string },
): Promise<boolean> {
  const active = await loadActiveSuperAdmins(adm);
  if (active.length === 0) {
    // Already zero. Either a cold-start edge case or another code
    // path already broke the invariant — block anyway.
    return true;
  }
  const uniqueActiveUsers = new Set(active.map((a) => a.user_id));
  if (opts.type === "remove_role") {
    // A user can theoretically hold more than one super_admin
    // user_branch_roles row (branch-scoped + global). Removing ONE row
    // only drops the user from the active set if that was their last
    // super_admin row. Fetch the row being removed and check.
    const { data: row } = await adm
      .from("user_branch_roles")
      .select("user_id, role, deleted_at")
      .eq("id", opts.role_row_id)
      .maybeSingle();
    if (!row || row.role !== "super_admin" || row.deleted_at !== null) {
      // The op is a no-op (already gone, or not a super_admin row).
      return false;
    }
    const { data: otherRows } = await adm
      .from("user_branch_roles")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("role", "super_admin")
      .is("deleted_at", null)
      .neq("id", opts.role_row_id);
    const userKeepsSuperAdmin = (otherRows?.length ?? 0) > 0;
    if (userKeepsSuperAdmin) return false;
    // Removing this row drops the user from the active super_admin set.
    return uniqueActiveUsers.size <= 1 && uniqueActiveUsers.has(row.user_id);
  }
  // deactivate_login — the user disappears from the active set regardless
  // of how many super_admin role rows they hold.
  if (!uniqueActiveUsers.has(opts.user_id)) {
    // The user isn't an active super_admin — op can't affect the count.
    return false;
  }
  return uniqueActiveUsers.size <= 1;
}
