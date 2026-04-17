import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RoleAssignment } from "./roles";

/**
 * Returns the authenticated user + profile + role assignments, or null if
 * unauthenticated. Wrapped in React.cache() so repeated calls within one
 * request are deduplicated.
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
      .select("id, email, full_name, phone, active, ui_theme, ui_catalog_view")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_branch_roles")
      .select("role, branch_id")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  return {
    user,
    profile,
    roles: (roles ?? []) as RoleAssignment[],
  };
});
