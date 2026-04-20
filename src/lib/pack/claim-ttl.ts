import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

/**
 * Phase 8 — pack claim TTL + lazy-cleanup sweeper.
 *
 * Single source of truth for the claim timeout. The sweeper is run:
 *   - at the top of every queue render (`fetchPackQueue`), so stale
 *     claims disappear the moment any packer lands on the page, AND
 *   - inside `claimOrder()` before evaluating whether the target row
 *     is still claimed — covers the edge case where a packer races
 *     another to claim a just-expired row.
 *
 * One bulk UPDATE per call, selective on `status` + age so it only
 * touches rows that could actually be stale. Per the Phase 8 PR
 * discussion: one write per queue render is fine.
 */

export const PACK_CLAIM_TTL_MINUTES = 30;

/**
 * Clear expired claim columns on every fulfilment-stage order whose
 * `claimed_at` is older than the TTL. Writes one `audit_log` row per
 * cleared claim so the trail is complete. Returns the count cleared
 * (mostly for tests — callers rarely need it).
 *
 * Intentionally uses the admin (service-role) client because:
 *   1. It must run even from a read-only context (queue render from a
 *      packer session, where `orders_update` RLS would still pass but
 *      a failed write shouldn't abort the read).
 *   2. It runs under a page-level gate (only admin/packer reach the
 *      queue); there's no privilege escalation to worry about.
 */
export async function sweepExpiredClaims(
  adm: SupabaseClient<Database>,
): Promise<number> {
  const cutoff = new Date(
    Date.now() - PACK_CLAIM_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const { data: stale } = await adm
    .from("orders")
    .select("id, order_number, claimed_by_user_id, claimed_at, status")
    .not("claimed_by_user_id", "is", null)
    .lt("claimed_at", cutoff)
    .in("status", ["approved", "picking"])
    .is("deleted_at", null);
  const rows = stale ?? [];
  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  const { error } = await adm
    .from("orders")
    .update({ claimed_by_user_id: null, claimed_at: null })
    .in("id", ids);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[pack:sweep] update failed: ${error.message}`);
    return 0;
  }

  await adm.from("audit_log").insert(
    rows.map((r) => ({
      entity_type: "order",
      entity_id: r.id,
      action: "order_claim_expired",
      actor_user_id: null, // system actor — the sweeper has no user
      before_json: {
        claimed_by_user_id: r.claimed_by_user_id,
        claimed_at: r.claimed_at,
      } as unknown as Json,
      after_json: {
        reason: "ttl_exceeded",
        ttl_minutes: PACK_CLAIM_TTL_MINUTES,
        order_number: r.order_number,
      } as unknown as Json,
    })),
  );
  return rows.length;
}
