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
  login_disabled: boolean;
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
  login_disabled: boolean;
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
      "id, email, full_name, active, login_disabled, deleted_at, created_at, user_branch_roles(role)",
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
      login_disabled: r.login_disabled,
      deleted_at: r.deleted_at,
      created_at: r.created_at,
      roles,
    };
  });
}

export type AdminUserDetail = {
  id: string;
  email: string;
  full_name: string | null;
  active: boolean;
  login_disabled: boolean;
  deleted_at: string | null;
  created_at: string;
  assignments: Array<{
    id: string;
    role: UserRole;
    branch_id: string | null;
    branch_code: string | null;
    branch_name: string | null;
    created_at: string;
  }>;
};

export async function fetchAdminUserDetail(
  id: string,
): Promise<AdminUserDetail | null> {
  const db = createAdminClient();
  const { data: user, error } = await db
    .from("users")
    .select(
      "id, email, full_name, active, login_disabled, deleted_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!user) return null;

  const { data: rows } = await db
    .from("user_branch_roles")
    .select(
      "id, role, branch_id, created_at, branches(branch_code, name)",
    )
    .eq("user_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  type RoleRow = {
    id: string;
    role: UserRole;
    branch_id: string | null;
    created_at: string;
    branches: { branch_code: string; name: string } | null;
  };
  const assignments = ((rows ?? []) as unknown as RoleRow[]).map((r) => ({
    id: r.id,
    role: r.role,
    branch_id: r.branch_id,
    branch_code: r.branches?.branch_code ?? null,
    branch_name: r.branches?.name ?? null,
    created_at: r.created_at,
  }));

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    active: user.active,
    login_disabled: user.login_disabled,
    deleted_at: user.deleted_at,
    created_at: user.created_at,
    assignments,
  };
}

/** Minimal branches fetch for role-assignment dropdowns. Admin-gated
 *  at the caller. */
export async function fetchAdminBranchesLite(): Promise<
  { id: string; branch_code: string; name: string }[]
> {
  const db = createAdminClient();
  const { data } = await db
    .from("branches")
    .select("id, branch_code, name")
    .is("deleted_at", null)
    .order("branch_code", { ascending: true });
  return data ?? [];
}
