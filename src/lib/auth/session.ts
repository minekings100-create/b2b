import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RoleAssignment } from "./roles";

/**
 * Returns the authenticated user + profile + role assignments, or null if
 * unauthenticated. Wrapped in React.cache() so repeated calls within one
 * request are deduplicated.
 *
 * Post-MVP Sprint 1 — also returns null (and force-signs-out) when
 * `public.users.login_disabled = true`. Covers the mid-session case
 * where an admin deactivates a user whose cookie is still valid.
 * Sign-in-time deactivation is handled in the login action.
 */
export const getUserWithRoles = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, full_name, phone, active, login_disabled, ui_theme, ui_catalog_view, welcome_dismissed_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_branch_roles")
      .select("role, branch_id")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  if (profile?.login_disabled) {
    // Cookie is still valid but admin pulled the plug. Clear the
    // session cookie + treat as anonymous — the caller will redirect
    // to /login, and the next login attempt will surface the
    // deactivation message via the login action's post-signin check.
    await supabase.auth.signOut();
    return null;
  }

  return {
    user,
    profile,
    roles: (roles ?? []) as RoleAssignment[],
  };
});
