import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Recipient resolvers for email triggers (SPEC §8.1, §8.2).
 *
 * Caller supplies a Supabase client — typically the service-role admin
 * client, since these resolvers need to read across users / branches that
 * the *acting* user may not have RLS access to (e.g. a branch user
 * submitting an order needs to email all managers of that branch).
 */

export type Recipient = { user_id: string; email: string };

type DB = SupabaseClient<Database>;

async function dedupe(rows: Array<Recipient | null>): Promise<Recipient[]> {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    if (!r) continue;
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push(r);
  }
  return out;
}

async function emailsForUserIds(db: DB, ids: string[]): Promise<Recipient[]> {
  if (ids.length === 0) return [];
  const { data } = await db
    .from("users")
    .select("id, email, active, deleted_at")
    .in("id", ids);
  return await dedupe(
    (data ?? [])
      .filter((u) => u.active && !u.deleted_at)
      .map((u) => ({ user_id: u.id, email: u.email })),
  );
}

/** Branch managers for a given branch (active assignments only). */
export async function managersForBranch(
  db: DB,
  branchId: string,
): Promise<Recipient[]> {
  const { data } = await db
    .from("user_branch_roles")
    .select("user_id")
    .eq("branch_id", branchId)
    .eq("role", "branch_manager")
    .is("deleted_at", null);
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
  return emailsForUserIds(db, ids);
}

/**
 * All HQ Managers (3.2.2 — global, no branch scoping). Audience for
 * `order_branch_approved` (step-1 → step-2 handoff) and the
 * branch-approved digest reminder.
 */
export async function hqManagers(db: DB): Promise<Recipient[]> {
  const { data } = await db
    .from("user_branch_roles")
    .select("user_id")
    .eq("role", "hq_operations_manager")
    .is("deleted_at", null);
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
  return emailsForUserIds(db, ids);
}

/** All packers (packers are pool-wide — no branch scoping per SPEC §5). */
export async function packerPool(db: DB): Promise<Recipient[]> {
  const { data } = await db
    .from("user_branch_roles")
    .select("user_id")
    .eq("role", "packer")
    .is("deleted_at", null);
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
  return emailsForUserIds(db, ids);
}

/** Administration + super_admin (the override-outstanding alert audience). */
export async function adminAudience(db: DB): Promise<Recipient[]> {
  const { data } = await db
    .from("user_branch_roles")
    .select("user_id, role")
    .in("role", ["administration", "super_admin"])
    .is("deleted_at", null);
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
  return emailsForUserIds(db, ids);
}

/** A single user (used by order_rejected → branch user who created the order). */
export async function userById(
  db: DB,
  userId: string,
): Promise<Recipient | null> {
  const { data } = await db
    .from("users")
    .select("id, email, active, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.active || data.deleted_at) return null;
  return { user_id: data.id, email: data.email };
}
