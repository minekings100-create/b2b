import { z } from "zod";

/**
 * Post-MVP Sprint 1 — Zod schemas for user lifecycle actions.
 */

export const USER_ROLE_VALUES = [
  "branch_user",
  "branch_manager",
  "packer",
  "hq_operations_manager",
  "administration",
  "super_admin",
] as const;

const RoleAssignmentInput = z.object({
  role: z.enum(USER_ROLE_VALUES),
  // Global roles (packer / hq_operations_manager / administration /
  // super_admin) have branch_id=null; branch-scoped ones (branch_user,
  // branch_manager) must have a UUID.
  branch_id: z.string().uuid().nullable().default(null),
});

export const InviteUserInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(1, "Full name is required").max(120),
  // One or more role assignments. Duplicate `(role, branch_id)` pairs
  // are deduped server-side.
  assignments: z
    .array(RoleAssignmentInput)
    .min(1, "At least one role assignment is required"),
});
export type InviteUserInputT = z.infer<typeof InviteUserInput>;

export const UpdateUserProfileInput = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
});
export type UpdateUserProfileInputT = z.infer<typeof UpdateUserProfileInput>;

export const AddRoleInput = z.object({
  user_id: z.string().uuid(),
  role: z.enum(USER_ROLE_VALUES),
  branch_id: z.string().uuid().nullable().default(null),
});
export type AddRoleInputT = z.infer<typeof AddRoleInput>;

export const RemoveRoleInput = z.object({
  role_row_id: z.string().uuid(),
});
export type RemoveRoleInputT = z.infer<typeof RemoveRoleInput>;

export const UserIdInput = z.object({ id: z.string().uuid() });
export type UserIdInputT = z.infer<typeof UserIdInput>;
