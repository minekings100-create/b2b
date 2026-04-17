import type { Database } from "@/lib/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROLES = [
  "branch_user",
  "branch_manager",
  "packer",
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
