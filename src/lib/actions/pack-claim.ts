"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import {
  PACK_CLAIM_TTL_MINUTES,
  sweepExpiredClaims,
} from "@/lib/pack/claim-ttl";

/**
 * Phase 8 — pack claim / release actions.
 *
 * Claim lifecycle:
 *   - `claimOrder(id)` — packer claims an order. Runs the expired-
 *     claim sweep first so a just-expired row can be claimed by a new
 *     packer on the same tick. Uses a column-guarded UPDATE
 *     (`.is('claimed_by_user_id', null)`) as a race-safe check: if
 *     another packer beat the caller to it, the UPDATE affects 0
 *     rows and the action returns an error.
 *   - `releaseOrder(id)` — the holder or an admin clears the claim.
 *
 * Rules:
 *   - Only packers (and admins who may be debugging) can claim.
 *   - A claim only makes sense on fulfilment-stage orders
 *     (approved | picking). `packed` + beyond are past the point of
 *     claim relevance.
 *   - Audit row per claim / release / admin-override / expiry.
 */

export type ClaimFormState =
  | { error: string }
  | { success: true; id: string }
  | undefined;

const ClaimInput = z.object({ id: z.string().uuid() });

export async function claimOrder(
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!hasAnyRole(session.roles, ["packer", "administration", "super_admin"])) {
    return { error: "Forbidden" };
  }

  const parsed = ClaimInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };
  const orderId = parsed.data.id;

  const adm = createAdminClient();
  // Sweep stale claims first — otherwise a 31-min-old claim would still
  // block a new packer. Cheap: one indexed UPDATE, usually 0 rows.
  await sweepExpiredClaims(adm);

  // Status guard: only approved / picking rows can be claimed.
  const { data: prior } = await adm
    .from("orders")
    .select("status, claimed_by_user_id, claimed_at, order_number")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { error: "Order not found" };
  if (!["approved", "picking"].includes(prior.status)) {
    return { error: `Order is not in a fulfilment stage (status=${prior.status})` };
  }
  if (prior.claimed_by_user_id && prior.claimed_by_user_id !== session.user.id) {
    return { error: "Order is already claimed by another packer" };
  }

  // Idempotent re-claim by the same user — update claimed_at to "now"
  // so their TTL clock resets on re-open.
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ claimed_by_user_id: session.user.id, claimed_at: now })
    .eq("id", orderId)
    // Race guard: either unclaimed OR already held by me. If a third
    // party raced in, their claim lives here and this UPDATE touches
    // zero rows.
    .or(
      `claimed_by_user_id.is.null,claimed_by_user_id.eq.${session.user.id}`,
    )
    .in("status", ["approved", "picking"])
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "Claim failed — another packer may have claimed it first" };
  }

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: orderId,
    action: "order_claim",
    actor_user_id: session.user.id,
    before_json: {
      claimed_by_user_id: prior.claimed_by_user_id,
      claimed_at: prior.claimed_at,
    } as unknown as Json,
    after_json: {
      claimed_by_user_id: session.user.id,
      claimed_at: now,
      order_number: prior.order_number,
    } as unknown as Json,
  });

  revalidatePath("/pack");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/pack/${orderId}`);
  return { success: true, id: orderId };
}

export async function releaseOrder(
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const parsed = ClaimInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };
  const orderId = parsed.data.id;

  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("orders")
    .select("claimed_by_user_id, claimed_at, order_number")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { error: "Order not found" };
  if (!prior.claimed_by_user_id) {
    // Idempotent — nothing to do.
    return { success: true, id: orderId };
  }

  const adminOverride = isAdmin(session.roles);
  const isHolder = prior.claimed_by_user_id === session.user.id;
  if (!isHolder && !adminOverride) {
    return { error: "Only the claim holder or an admin can release" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ claimed_by_user_id: null, claimed_at: null })
    .eq("id", orderId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: orderId,
    action: adminOverride && !isHolder ? "order_claim_admin_release" : "order_release",
    actor_user_id: session.user.id,
    before_json: {
      claimed_by_user_id: prior.claimed_by_user_id,
      claimed_at: prior.claimed_at,
    } as unknown as Json,
    after_json: {
      claimed_by_user_id: null,
      claimed_at: null,
      order_number: prior.order_number,
      admin_override: adminOverride && !isHolder,
      ttl_minutes: PACK_CLAIM_TTL_MINUTES,
    } as unknown as Json,
  });

  revalidatePath("/pack");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/pack/${orderId}`);
  return { success: true, id: orderId };
}
