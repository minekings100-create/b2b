import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase 7b-2b — branches admin list.
 *
 * Uses the admin (service-role) client because:
 *   1. Even for admins, the existing `branches_select` policy filters
 *      `deleted_at IS NULL`, so archived rows aren't visible via the
 *      session client. Rather than loosen the policy (and affect every
 *      other read site), the admin list bypasses RLS.
 *   2. super_admin / administration already have cross-branch access
 *      via `current_user_has_branch`; RLS isn't the security boundary
 *      here — the page-level `isAdmin()` gate is.
 *
 * Keep this helper admin-only. Callers MUST gate at the page layer.
 */

export type AdminBranchRow = {
  id: string;
  name: string;
  branch_code: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export async function fetchAdminBranches(
  opts: { archivedOnly?: boolean } = {},
): Promise<AdminBranchRow[]> {
  const db = createAdminClient();
  let q = db
    .from("branches")
    .select("id, name, branch_code, email, phone, active, deleted_at, created_at")
    .order("branch_code", { ascending: true });
  if (opts.archivedOnly) {
    q = q.not("deleted_at", "is", null);
  } else {
    q = q.is("deleted_at", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AdminBranchRow[];
}
