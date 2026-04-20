"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin, isHqManager } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 8 — rush flag actions.
 *
 * Who can flip `is_rush`:
 *   - The creator, at submit time (handled inline in `submitOrder` —
 *     this module's `setRush` covers the post-submit flip only).
 *   - HQ Manager, administration, super_admin — at any point BEFORE
 *     `packed`. Flipping it after packed has no effect on the queue,
 *     so refusing loudly is the honest UX.
 *
 * Branch managers and branch users DON'T get post-submit toggle —
 * they'd use their cancel-and-resubmit path if they realised mid-
 * approval that the order needs to be rushed.
 *
 * Audit: one row per flip with before/after + reason (implicit: the
 * session's role).
 */

export type RushFormState =
  | { error: string }
  | { success: true; id: string; is_rush: boolean }
  | undefined;

const RushInput = z.object({
  id: z.string().uuid(),
  // Zod coerces FormData's "true"/"false" string into a boolean.
  is_rush: z.preprocess(
    (v) => (v === "true" || v === "on" || v === true ? true : false),
    z.boolean(),
  ),
});

const POST_SUBMIT_TOGGLABLE_STATUSES = [
  "submitted",
  "branch_approved",
  "approved",
  "picking",
] as const;

export async function setRush(
  _prev: RushFormState,
  formData: FormData,
): Promise<RushFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !isAdmin(session.roles) &&
    !isHqManager(session.roles)
  ) {
    return { error: "Forbidden" };
  }

  const parsed = RushInput.safeParse({
    id: formData.get("id"),
    is_rush: formData.get("is_rush"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("orders")
    .select("status, is_rush, order_number")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { error: "Order not found" };
  if (
    !(POST_SUBMIT_TOGGLABLE_STATUSES as readonly string[]).includes(
      prior.status,
    )
  ) {
    return {
      error: `Rush can't be changed once the order is ${prior.status}`,
    };
  }
  if (prior.is_rush === parsed.data.is_rush) {
    // Idempotent — no-op.
    return {
      success: true,
      id: parsed.data.id,
      is_rush: parsed.data.is_rush,
    };
  }

  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      is_rush: parsed.data.is_rush,
      rush_set_by_user_id: session.user.id,
      rush_set_at: now,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: parsed.data.id,
    action: parsed.data.is_rush ? "order_rush_set" : "order_rush_cleared",
    actor_user_id: session.user.id,
    before_json: { is_rush: prior.is_rush } as unknown as Json,
    after_json: {
      is_rush: parsed.data.is_rush,
      order_number: prior.order_number,
      rush_set_at: now,
    } as unknown as Json,
  });

  revalidatePath("/pack");
  revalidatePath(`/orders/${parsed.data.id}`);
  return {
    success: true,
    id: parsed.data.id,
    is_rush: parsed.data.is_rush,
  };
}

// Exported for the creator-at-submit flip from `submitOrder` in
// `src/lib/actions/cart.ts`. Branch users don't reach `setRush`;
// they pass their checkbox state through to cart submission.
export { hasAnyRole };
