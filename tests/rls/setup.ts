import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error(
    "RLS tests require NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

export const admin: SupabaseClient<Database> = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Create a user-scoped Supabase client by attaching a JWT access token. */
export function userClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type TestFixture = {
  branchA: { id: string };
  branchB: { id: string };
  userAManager: { id: string; email: string; accessToken: string };
  userBUser:    { id: string; email: string; accessToken: string };
  superAdmin:   { id: string; email: string; accessToken: string };
};

const PASSWORD = "rls-test-password";

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function makeUser(
  role: "branch_manager" | "branch_user" | "super_admin",
  branchId: string | null,
) {
  const suffix = rand();
  const email = `${role}_${suffix}@rls.test`;

  const { data: u, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `${role} ${suffix}` },
  });
  if (createErr) throw createErr;

  const { error: roleErr } = await admin.from("user_branch_roles").insert({
    user_id: u.user.id,
    branch_id: branchId,
    role,
  });
  if (roleErr) throw roleErr;

  const anon = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signed, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signErr) throw signErr;

  return {
    id: u.user.id,
    email,
    accessToken: signed.session!.access_token,
  };
}

/**
 * Provisions two branches and three users. Returns auth sessions so tests
 * can issue queries as each persona. Call `cleanupFixture` in `afterAll`.
 */
export async function seedFixture(): Promise<TestFixture> {
  const suffix = rand();

  const { data: a, error: aErr } = await admin
    .from("branches")
    .insert({ name: `Branch A ${suffix}`, branch_code: `A-${suffix}`.slice(0, 16) })
    .select("id")
    .single();
  if (aErr) throw aErr;

  const { data: b, error: bErr } = await admin
    .from("branches")
    .insert({ name: `Branch B ${suffix}`, branch_code: `B-${suffix}`.slice(0, 16) })
    .select("id")
    .single();
  if (bErr) throw bErr;

  const userAManager = await makeUser("branch_manager", a!.id as string);
  const userBUser    = await makeUser("branch_user",    b!.id as string);
  const superAdmin   = await makeUser("super_admin",    null);

  return {
    branchA: { id: a!.id as string },
    branchB: { id: b!.id as string },
    userAManager,
    userBUser,
    superAdmin,
  };
}

export async function cleanupFixture(fixture: TestFixture): Promise<void> {
  // Users first (cascade deletes their user_branch_roles).
  await admin.auth.admin.deleteUser(fixture.userAManager.id);
  await admin.auth.admin.deleteUser(fixture.userBUser.id);
  await admin.auth.admin.deleteUser(fixture.superAdmin.id);
  // Branches last.
  await admin
    .from("branches")
    .delete()
    .in("id", [fixture.branchA.id, fixture.branchB.id]);
}
