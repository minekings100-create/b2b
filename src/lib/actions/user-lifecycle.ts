"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isSuperAdmin } from "@/lib/auth/roles";
import { wouldLeaveZeroSuperAdmins } from "@/lib/auth/last-super-admin";
import {
  AddRoleInput,
  InviteUserInput,
  RemoveRoleInput,
  UpdateUserProfileInput,
  UserIdInput,
} from "@/lib/validation/user-lifecycle";
import type { Json } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 1 — user lifecycle actions.
 *
 * Auth-admin touchpoints:
 *   - `auth.admin.inviteUserByEmail` (invite)
 *   - `supabase.auth.resetPasswordForEmail` (admin-triggered reset)
 *
 * NOT touched: `auth.admin.updateUserById` with `banned_until`.
 * Deactivation flips `public.users.login_disabled` instead — the
 * middleware enforces the bounce on sign-in. Supabase Auth stays as
 * the identity layer; our authorization layer owns login eligibility.
 *
 * Every mutation writes one `audit_log` row. Payload names listed in
 * the PR description.
 */

export type UserFormState =
  | { error: string }
  | { success: true; id: string }
  | undefined;

function fieldErrors(
  issues: readonly { path: ReadonlyArray<PropertyKey>; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const iss of issues) {
    const key = iss.path.map(String).join(".");
    if (key && !out[key]) out[key] = iss.message;
  }
  return out;
}

// ---------- Invite --------------------------------------------------------

export async function inviteUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  // FormData → structured assignments. Convention: multiple
  // `assignments` rows are POSTed as repeated `assignments_role` +
  // `assignments_branch_id` fields, pair-by-index.
  const roles = formData.getAll("assignments_role").map(String);
  const branchIds = formData
    .getAll("assignments_branch_id")
    .map((v) => (v === "" ? null : String(v)));
  const assignments = roles.map((role, i) => ({
    role,
    branch_id: branchIds[i] ?? null,
  }));

  const parsed = InviteUserInput.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    assignments,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Block admin-elevation: only super_admin can invite another
  // super_admin. Matches the rule in the PR brief.
  if (
    parsed.data.assignments.some((a) => a.role === "super_admin") &&
    !isSuperAdmin(session.roles)
  ) {
    return { error: "Only a super_admin can invite another super_admin" };
  }

  const adm = createAdminClient();
  const email = parsed.data.email;

  // Does the user already exist in auth.users?
  const { data: authUsers } = await adm.auth.admin.listUsers();
  const existing = (authUsers?.users ?? []).find((u) => u.email === email);
  if (existing) {
    return {
      error:
        "A user with that email already exists. Assign roles to them on their detail page instead.",
    };
  }

  const { data: invited, error: inviteErr } = await adm.auth.admin.inviteUserByEmail(
    email,
    { data: { full_name: parsed.data.full_name } },
  );
  if (inviteErr || !invited.user) {
    return { error: `Invite failed: ${inviteErr?.message ?? "unknown"}` };
  }
  const newUserId = invited.user.id;

  // public.users is populated by the existing on-signup trigger; we
  // patch `full_name` explicitly in case the trigger didn't lift it
  // from user_metadata.
  await adm
    .from("users")
    .update({ full_name: parsed.data.full_name })
    .eq("id", newUserId);

  // Dedupe + insert role assignments.
  const uniq = new Map<string, { role: string; branch_id: string | null }>();
  for (const a of parsed.data.assignments) {
    uniq.set(`${a.role}:${a.branch_id ?? ""}`, a);
  }
  const roleRows = Array.from(uniq.values()).map((a) => ({
    user_id: newUserId,
    role: a.role as "branch_user",
    branch_id: a.branch_id,
  }));
  if (roleRows.length > 0) {
    const { error: rErr } = await adm
      .from("user_branch_roles")
      .insert(roleRows);
    if (rErr) return { error: `Role insert failed: ${rErr.message}` };
  }

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: newUserId,
    action: "user_invited",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      email,
      full_name: parsed.data.full_name,
      assignments: Array.from(uniq.values()),
    } as unknown as Json,
  });

  revalidatePath("/users");
  redirect(`/users/${newUserId}`);
}

// ---------- Update profile ------------------------------------------------

export async function updateUserProfile(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UpdateUserProfileInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("users")
    .select("full_name, email")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "User not found" };

  const { error } = await adm
    .from("users")
    .update({ full_name: parsed.data.full_name })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "user_updated",
    actor_user_id: session.user.id,
    before_json: { full_name: prior.full_name } as unknown as Json,
    after_json: { full_name: parsed.data.full_name } as unknown as Json,
  });

  revalidatePath(`/users/${parsed.data.id}`);
  return { success: true, id: parsed.data.id };
}

// ---------- Add role assignment ------------------------------------------

export async function addRole(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = AddRoleInput.safeParse({
    user_id: formData.get("user_id"),
    role: formData.get("role"),
    branch_id:
      formData.get("branch_id") === "" ? null : formData.get("branch_id"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (parsed.data.role === "super_admin" && !isSuperAdmin(session.roles)) {
    return { error: "Only a super_admin can grant super_admin" };
  }

  const adm = createAdminClient();
  // Idempotent re-add: if the (user, role, branch) row exists and is
  // soft-deleted, un-delete it. If it exists and is active, no-op.
  const { data: existing } = await adm
    .from("user_branch_roles")
    .select("id, deleted_at")
    .eq("user_id", parsed.data.user_id)
    .eq("role", parsed.data.role)
    // branch_id needs equality including null — supabase-js's `.is` for null
    .maybeSingle();
  // The maybeSingle above may match a row with the wrong branch_id; do
  // an explicit full match by hand.
  const { data: exact } = parsed.data.branch_id === null
    ? await adm
        .from("user_branch_roles")
        .select("id, deleted_at")
        .eq("user_id", parsed.data.user_id)
        .eq("role", parsed.data.role)
        .is("branch_id", null)
        .maybeSingle()
    : await adm
        .from("user_branch_roles")
        .select("id, deleted_at")
        .eq("user_id", parsed.data.user_id)
        .eq("role", parsed.data.role)
        .eq("branch_id", parsed.data.branch_id)
        .maybeSingle();
  void existing;

  let roleRowId: string;
  if (exact) {
    if (exact.deleted_at === null) {
      return { error: "User already has this role for this branch" };
    }
    const { error } = await adm
      .from("user_branch_roles")
      .update({ deleted_at: null })
      .eq("id", exact.id);
    if (error) return { error: error.message };
    roleRowId = exact.id;
  } else {
    const { data: inserted, error } = await adm
      .from("user_branch_roles")
      .insert({
        user_id: parsed.data.user_id,
        role: parsed.data.role,
        branch_id: parsed.data.branch_id,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    roleRowId = inserted.id;
  }

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.user_id,
    action: parsed.data.branch_id
      ? "user_branch_added"
      : "user_role_added",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      role: parsed.data.role,
      branch_id: parsed.data.branch_id,
      role_row_id: roleRowId,
    } as unknown as Json,
  });

  revalidatePath(`/users/${parsed.data.user_id}`);
  return { success: true, id: parsed.data.user_id };
}

// ---------- Remove role assignment ---------------------------------------

export async function removeRole(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = RemoveRoleInput.safeParse({
    role_row_id: formData.get("role_row_id"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const adm = createAdminClient();
  const { data: row } = await adm
    .from("user_branch_roles")
    .select("id, user_id, role, branch_id, deleted_at")
    .eq("id", parsed.data.role_row_id)
    .maybeSingle();
  if (!row) return { error: "Role assignment not found" };
  if (row.deleted_at !== null) {
    return { success: true, id: row.user_id }; // already removed
  }

  // Only super_admin can remove a super_admin row.
  if (row.role === "super_admin" && !isSuperAdmin(session.roles)) {
    return { error: "Only a super_admin can revoke super_admin" };
  }

  // Last-super-admin guard.
  if (row.role === "super_admin") {
    const trips = await wouldLeaveZeroSuperAdmins(adm, {
      type: "remove_role",
      user_id: row.user_id,
      role_row_id: row.id,
    });
    if (trips) {
      return {
        error:
          "Cannot leave the system with zero super admins — add another super_admin first.",
      };
    }
  }

  const { error } = await adm
    .from("user_branch_roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) return { error: error.message };

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: row.user_id,
    action: row.branch_id ? "user_branch_removed" : "user_role_removed",
    actor_user_id: session.user.id,
    before_json: {
      role: row.role,
      branch_id: row.branch_id,
      role_row_id: row.id,
    } as unknown as Json,
    after_json: null,
  });

  revalidatePath(`/users/${row.user_id}`);
  return { success: true, id: row.user_id };
}

// ---------- Trigger password reset ---------------------------------------

export async function triggerPasswordReset(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UserIdInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const adm = createAdminClient();
  const { data: target } = await adm
    .from("users")
    .select("email")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!target) return { error: "User not found" };

  // Use the non-admin `resetPasswordForEmail` — sends the standard
  // Supabase reset email with a magic link.
  const { error } = await adm.auth.resetPasswordForEmail(target.email);
  if (error) return { error: error.message };

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "user_password_reset_triggered",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: { email: target.email } as unknown as Json,
  });

  revalidatePath(`/users/${parsed.data.id}`);
  return { success: true, id: parsed.data.id };
}

// ---------- Deactivate / reactivate login -------------------------------

export async function deactivateLogin(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UserIdInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };
  if (parsed.data.id === session.user.id) {
    return { error: "You can't deactivate your own login" };
  }

  const adm = createAdminClient();
  const { data: target } = await adm
    .from("users")
    .select("email, login_disabled")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!target) return { error: "User not found" };
  if (target.login_disabled) {
    return { success: true, id: parsed.data.id }; // idempotent
  }

  // Last-super-admin guard applies here too.
  const trips = await wouldLeaveZeroSuperAdmins(adm, {
    type: "deactivate_login",
    user_id: parsed.data.id,
  });
  if (trips) {
    return {
      error:
        "Cannot deactivate — this is the last active super_admin. Add another super_admin first.",
    };
  }

  const { error } = await adm
    .from("users")
    .update({ login_disabled: true })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "user_deactivated",
    actor_user_id: session.user.id,
    before_json: { login_disabled: false } as unknown as Json,
    after_json: { login_disabled: true } as unknown as Json,
  });

  revalidatePath(`/users/${parsed.data.id}`);
  return { success: true, id: parsed.data.id };
}

export async function reactivateLogin(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UserIdInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const adm = createAdminClient();
  const { data: target } = await adm
    .from("users")
    .select("login_disabled")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!target) return { error: "User not found" };
  if (!target.login_disabled) {
    return { success: true, id: parsed.data.id }; // idempotent
  }

  const { error } = await adm
    .from("users")
    .update({ login_disabled: false })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "user",
    entity_id: parsed.data.id,
    action: "user_reactivated",
    actor_user_id: session.user.id,
    before_json: { login_disabled: true } as unknown as Json,
    after_json: { login_disabled: false } as unknown as Json,
  });

  revalidatePath(`/users/${parsed.data.id}`);
  return { success: true, id: parsed.data.id };
}
