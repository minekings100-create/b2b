import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { Database } from "@/lib/supabase/types";

/**
 * Phase 7b-2b — users admin list.
 *
 * Uses the admin (service-role) client for the same reason as
 * `branches-admin.ts`: the `users_select` policy filters
 * `deleted_at IS NULL`, so archived rows are invisible via session
 * client. Loosening that policy would widen the read surface for
 * every other site in the app. The admin list bypasses RLS; the
 * page-level `isAdmin()` gate is the security boundary.
 */

type UserRole = Database["public"]["Enums"]["user_role"];

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  /** Deduplicated role names across all branch assignments. */
  roles: UserRole[];
};

type RawRow = {
  id: string;
  email: string;
  full_name: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  user_branch_roles: { role: UserRole }[] | null;
};

export async function fetchAdminUsers(
  opts: { archivedOnly?: boolean } = {},
): Promise<AdminUserRow[]> {
  const db = createAdminClient();
  let q = db
    .from("users")
    .select(
      "id, email, full_name, active, deleted_at, created_at, user_branch_roles(role)",
    )
    .order("email", { ascending: true });
  if (opts.archivedOnly) {
    q = q.not("deleted_at", "is", null);
  } else {
    q = q.is("deleted_at", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as RawRow[]).map((r) => {
    const roles = Array.from(
      new Set((r.user_branch_roles ?? []).map((x) => x.role)),
    );
    return {
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      active: r.active,
      deleted_at: r.deleted_at,
      created_at: r.created_at,
      roles,
    };
  });
}
