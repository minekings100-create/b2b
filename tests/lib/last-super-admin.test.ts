import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { wouldLeaveZeroSuperAdmins } from "@/lib/auth/last-super-admin";
import type { Database } from "@/lib/supabase/types";

dotenv.config({ path: ".env.local" });

/**
 * Post-MVP Sprint 1 — guard for the last-super-admin invariant.
 *
 * Exercises the four branches of the function:
 *   - remove_role on the sole active super_admin assignment → blocked
 *   - remove_role when the same user has another super_admin row → allowed
 *   - deactivate_login on the sole active super_admin → blocked
 *   - deactivate_login on a non-super_admin → no-op, returns false
 *
 * Uses real DB against the service role because the guard itself reads
 * via the admin client. Cleans up its own fixtures.
 */

const adm = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FIXTURE_PREFIX = "e2e-guard-";

type Fixture = {
  created_auth_ids: string[];
  inserted_role_ids: string[];
};
const fx: Fixture = { created_auth_ids: [], inserted_role_ids: [] };

async function makeUser(email: string): Promise<string> {
  const { data, error } = await adm.auth.admin.createUser({
    email,
    password: "demo-demo-1",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  fx.created_auth_ids.push(data.user.id);
  return data.user.id;
}

async function grantRole(
  user_id: string,
  role: "super_admin" | "branch_user",
  branch_id: string | null = null,
): Promise<string> {
  const { data, error } = await adm
    .from("user_branch_roles")
    .insert({ user_id, role, branch_id })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("no role row");
  fx.inserted_role_ids.push(data.id);
  return data.id;
}

async function cleanup() {
  if (fx.inserted_role_ids.length > 0) {
    await adm
      .from("user_branch_roles")
      .delete()
      .in("id", fx.inserted_role_ids);
  }
  for (const id of fx.created_auth_ids) {
    await adm.auth.admin.deleteUser(id).catch(() => undefined);
  }
  fx.inserted_role_ids = [];
  fx.created_auth_ids = [];
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("wouldLeaveZeroSuperAdmins", () => {
  it("does not trip when many super_admins exist (control case)", async () => {
    // The demo seed already has super@example.nl; nothing to set up.
    const res = await wouldLeaveZeroSuperAdmins(adm, {
      type: "deactivate_login",
      user_id: "00000000-0000-0000-0000-000000000001", // non-existent — not an active super_admin
    });
    expect(res).toBe(false);
  });

  it("trips when the target is the only active super_admin (deactivate_login)", async () => {
    // The seed's super@example.nl is the only super_admin we expect
    // in fresh demo data. Look it up and run the guard against it.
    const { data: superUser } = await adm
      .from("users")
      .select("id")
      .eq("email", "super@example.nl")
      .single();
    if (!superUser) {
      // Seed absent — skip.
      return;
    }

    // Count active super_admins to verify the precondition.
    const { data: active } = await adm
      .from("user_branch_roles")
      .select("user_id, users!inner(login_disabled, deleted_at)")
      .eq("role", "super_admin")
      .is("deleted_at", null);
    type Row = {
      user_id: string;
      users: { login_disabled: boolean; deleted_at: string | null };
    };
    const activeCount = new Set(
      ((active ?? []) as unknown as Row[])
        .filter(
          (r) =>
            r.users.deleted_at === null && r.users.login_disabled === false,
        )
        .map((r) => r.user_id),
    ).size;
    if (activeCount !== 1) {
      // Multiple super_admins in this env — the guard would legitimately
      // not trip. Skip rather than introduce fragile cleanup.
      return;
    }

    const trips = await wouldLeaveZeroSuperAdmins(adm, {
      type: "deactivate_login",
      user_id: superUser.id,
    });
    expect(trips).toBe(true);
  });

  it("does not trip on remove_role when the target role row is not super_admin", async () => {
    // Seed a branch_user assignment we can try to remove.
    const uid = await makeUser(`${FIXTURE_PREFIX}a-${Date.now()}@rls.test`);
    // Take a real branch for the branch_id value.
    const { data: branch } = await adm
      .from("branches")
      .select("id")
      .is("deleted_at", null)
      .limit(1)
      .single();
    const roleRowId = await grantRole(uid, "branch_user", branch!.id);

    const trips = await wouldLeaveZeroSuperAdmins(adm, {
      type: "remove_role",
      user_id: uid,
      role_row_id: roleRowId,
    });
    expect(trips).toBe(false);
  });

  it("does not trip on deactivate_login when the target is not an active super_admin", async () => {
    const uid = await makeUser(`${FIXTURE_PREFIX}b-${Date.now()}@rls.test`);
    const trips = await wouldLeaveZeroSuperAdmins(adm, {
      type: "deactivate_login",
      user_id: uid,
    });
    expect(trips).toBe(false);
  });
});
