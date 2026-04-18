import type { Database } from "@/lib/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROLES = [
  "branch_user",
  "branch_manager",
  "packer",
  "hq_operations_manager",
  "administration",
  "super_admin",
] as const satisfies readonly UserRole[];

export type RoleAssignment = {
  role: UserRole;
  branch_id: string | null;
};

export function hasRole(
  assignments: readonly RoleAssignment[],
  role: UserRole,
): boolean {
  return assignments.some((a) => a.role === role);
}

export function hasAnyRole(
  assignments: readonly RoleAssignment[],
  roles: readonly UserRole[],
): boolean {
  return assignments.some((a) => roles.includes(a.role));
}

export function branchesForRole(
  assignments: readonly RoleAssignment[],
  role: UserRole,
): string[] {
  return assignments
    .filter((a) => a.role === role && a.branch_id !== null)
    .map((a) => a.branch_id as string);
}

export function isAdmin(assignments: readonly RoleAssignment[]): boolean {
  return hasAnyRole(assignments, ["super_admin", "administration"]);
}

/**
 * HQ Manager — global second-step approver introduced in 3.2.2 (SPEC §5).
 * Crucially NOT included in `isAdmin` because HQ has no user/catalog/
 * invoice mutation rights; only second-step approval + cross-branch read.
 */
export function isHqManager(assignments: readonly RoleAssignment[]): boolean {
  return hasRole(assignments, "hq_operations_manager");
}

/**
 * Roles that view orders cross-branch and therefore see the "All orders"
 * sidebar label rather than the branch-scoped "Orders" label. Decision
 * S4 (PROJECT-JOURNAL.md, 3.2.2 plan): one label per role, never both,
 * same `/orders` route.
 */
export function viewsOrdersCrossBranch(
  assignments: readonly RoleAssignment[],
): boolean {
  return isAdmin(assignments) || isHqManager(assignments);
}
