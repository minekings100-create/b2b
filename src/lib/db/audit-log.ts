import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 7b-2a — audit-log read helper for the admin viewer.
 *
 * RLS on `audit_log` (migration 20260417000003) already scopes the
 * SELECT to super_admin + administration + self — so calling this via
 * the session client means the DB enforces who can see what. The page
 * layer still gates to `isAdmin` for a friendlier UX on non-admins
 * (they'd get an empty table otherwise).
 *
 * Filters are all optional. The page parses them with Zod at the
 * trust boundary and passes through verbatim.
 */

export type AuditLogRow = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  before_json: unknown;
  after_json: unknown;
};

export type AuditLogFilters = {
  entity_type?: string;
  action?: string;
  actor_user_id?: string;
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
  limit?: number;
  offset?: number;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  /** Email-by-uid map for the actor ids present in `rows`. */
  actor_email: Record<string, string>;
  /** Total count matching the filters (for pagination UX). */
  total: number;
};

const DEFAULT_PAGE_SIZE = 50;

export async function fetchAuditLogPage(
  filters: AuditLogFilters = {},
): Promise<AuditLogPage> {
  const db = createClient();
  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
  const offset = filters.offset ?? 0;

  let q = db
    .from("audit_log")
    .select(
      "id, created_at, entity_type, entity_id, action, actor_user_id, before_json, after_json",
      { count: "exact" },
    );
  if (filters.entity_type) q = q.eq("entity_type", filters.entity_type);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.actor_user_id) q = q.eq("actor_user_id", filters.actor_user_id);
  if (filters.since) q = q.gte("created_at", `${filters.since}T00:00:00Z`);
  if (filters.until) q = q.lte("created_at", `${filters.until}T23:59:59Z`);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as AuditLogRow[];
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x)),
  );
  const actor_email: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: users } = await db
      .from("users")
      .select("id, email")
      .in("id", actorIds);
    for (const u of users ?? []) actor_email[u.id] = u.email;
  }

  return { rows, actor_email, total: count ?? 0 };
}

/** Resolves an email to a user id, or null if no match. Used when the
 *  viewer's "actor email" filter param is in play. */
export async function resolveActorIdByEmail(
  email: string,
): Promise<string | null> {
  const db = createClient();
  const { data } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id ?? null;
}
