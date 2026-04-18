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

type Persona = { id: string; email: string; accessToken: string };

export type TestFixture = {
  branchA: { id: string };
  branchB: { id: string };
  userAManager: Persona;
  userBUser:    Persona;
  superAdmin:   Persona;
  // 3.2.2a additions — needed by the HQ visibility test and the packer
  // narrow-visibility regression guard.
  hqManager:    Persona;
  packer:       Persona;
  /**
   * Seeded sample orders, one per (branch × status) we need to assert
   * against. Use `branchUserA` (created lazily) as creator of the branch-A
   * orders so the orders pass the NOT NULL `created_by_user_id` constraint.
   */
  branchUserA:  Persona;
  orders: {
    aSubmitted:      { id: string };
    aBranchApproved: { id: string };
    aApproved:       { id: string };
    aPicking:        { id: string };
    bSubmitted:      { id: string };
    bApproved:       { id: string };
  };
};

const PASSWORD = "rls-test-password";

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

type SeedRole =
  | "branch_manager"
  | "branch_user"
  | "super_admin"
  | "hq_operations_manager"
  | "packer";

async function makeUser(role: SeedRole, branchId: string | null): Promise<Persona> {
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

async function makeOrder(opts: {
  branchId: string;
  creatorId: string;
  status: Database["public"]["Enums"]["order_status"];
  branchApprovedById?: string | null;
}): Promise<{ id: string }> {
  const suffix = rand();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

  const branchApprovedAt =
    opts.status === "branch_approved" ||
    opts.status === "approved" ||
    opts.status === "picking"
      ? dayAgo
      : null;
  const approvedAt =
    opts.status === "approved" || opts.status === "picking"
      ? now.toISOString()
      : null;

  const { data, error } = await admin
    .from("orders")
    .insert({
      order_number: `RLS-${suffix}-${Math.floor(Math.random() * 9999)}`,
      branch_id: opts.branchId,
      created_by_user_id: opts.creatorId,
      status: opts.status,
      submitted_at: opts.status === "draft" ? null : dayAgo,
      branch_approved_at: branchApprovedAt,
      branch_approved_by_user_id: branchApprovedAt
        ? (opts.branchApprovedById ?? opts.creatorId)
        : null,
      approved_at: approvedAt,
      approved_by_user_id: approvedAt
        ? (opts.branchApprovedById ?? opts.creatorId)
        : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data!.id };
}

/**
 * Provisions two branches, the original three personas, plus an HQ Manager,
 * a packer, and a small set of orders covering every status the
 * 3.2.2a RLS tests need to assert against.
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
  const branchUserA  = await makeUser("branch_user",    a!.id as string);
  const userBUser    = await makeUser("branch_user",    b!.id as string);
  const superAdmin   = await makeUser("super_admin",    null);
  const hqManager    = await makeUser("hq_operations_manager", null);
  const packer       = await makeUser("packer",         null);

  const aSubmitted      = await makeOrder({ branchId: a!.id, creatorId: branchUserA.id, status: "submitted" });
  const aBranchApproved = await makeOrder({ branchId: a!.id, creatorId: branchUserA.id, status: "branch_approved", branchApprovedById: userAManager.id });
  const aApproved       = await makeOrder({ branchId: a!.id, creatorId: branchUserA.id, status: "approved", branchApprovedById: userAManager.id });
  const aPicking        = await makeOrder({ branchId: a!.id, creatorId: branchUserA.id, status: "picking", branchApprovedById: userAManager.id });
  const bSubmitted      = await makeOrder({ branchId: b!.id, creatorId: userBUser.id, status: "submitted" });
  const bApproved       = await makeOrder({ branchId: b!.id, creatorId: userBUser.id, status: "approved", branchApprovedById: userBUser.id });

  return {
    branchA: { id: a!.id as string },
    branchB: { id: b!.id as string },
    userAManager,
    branchUserA,
    userBUser,
    superAdmin,
    hqManager,
    packer,
    orders: { aSubmitted, aBranchApproved, aApproved, aPicking, bSubmitted, bApproved },
  };
}

export async function cleanupFixture(fixture: TestFixture): Promise<void> {
  // Orders first (audit_log entries cascade with the orders.id deletion path
  // we use here — but the audit_log FK is loose; clean those up explicitly).
  const orderIds = Object.values(fixture.orders).map((o) => o.id);
  await admin.from("audit_log").delete().eq("entity_type", "order").in("entity_id", orderIds);
  await admin.from("orders").delete().in("id", orderIds);
  // Users next (cascade deletes their user_branch_roles).
  await admin.auth.admin.deleteUser(fixture.userAManager.id);
  await admin.auth.admin.deleteUser(fixture.branchUserA.id);
  await admin.auth.admin.deleteUser(fixture.userBUser.id);
  await admin.auth.admin.deleteUser(fixture.superAdmin.id);
  await admin.auth.admin.deleteUser(fixture.hqManager.id);
  await admin.auth.admin.deleteUser(fixture.packer.id);
  // Branches last.
  await admin
    .from("branches")
    .delete()
    .in("id", [fixture.branchA.id, fixture.branchB.id]);
}
