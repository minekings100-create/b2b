"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isHqManager } from "@/lib/auth/roles";
import {
  ApproveOrderInput,
  CancelOrderInput,
  RejectOrderInput,
} from "@/lib/validation/approval";
import type { Json } from "@/lib/supabase/types";

/**
 * Two-step approval (3.2.2b, SPEC §8.2):
 *
 *   submitted ──[branchApproveOrder]──> branch_approved ──[hqApproveOrder]──> approved
 *               │                                          │
 *               └──[rejectOrder, BM, w/reason]──> rejected ┴──[rejectOrder, HQ, w/reason]──> rejected
 *
 * Inventory reservations land at step 1 (branch approval) — HQ rejection or
 * cancellation from `branch_approved` must release them. The release path is
 * shared with cancelOrder via `releaseReservedFor()`.
 *
 * Inventory writes use the service-role client (RLS only admits
 * super_admin / administration / packer on `inventory*` tables — branch
 * managers and HQ aren't listed there). The application gate above each
 * write is strictly tighter than the missing RLS, so the bypass is safe.
 */

export type ApprovalActionState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true }
  | undefined;

type Order = {
  id: string;
  branch_id: string;
  status: string;
  created_by_user_id: string;
  branch_approved_by_user_id: string | null;
  approved_by_user_id: string | null;
};

async function loadOrder(
  supabase: ReturnType<typeof createClient>,
  id: string,
): Promise<Order | null> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id, branch_id, status, created_by_user_id, branch_approved_by_user_id, approved_by_user_id",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Order | null) ?? null;
}

// ---------------------------------------------------------------------------
// Step 1 — Branch Manager approval (submitted → branch_approved)
// ---------------------------------------------------------------------------

/**
 * Branch Manager approves at step 1. Per SPEC §8.2:
 *  - Each line's `quantity_approved` may be adjusted downward from
 *    `quantity_requested`; 0 effectively skips that line.
 *  - Approved quantities create `inventory_movements` rows with
 *    `reason='order_reserved'` and bump `inventory.quantity_reserved`.
 *  - If any approved qty exceeds on-hand − reserved the order goes through
 *    anyway (backorder) and we flag it on the audit entry.
 *  - On success: status flips to `branch_approved`; HQ then takes over.
 */
export async function branchApproveOrder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const order_id = String(formData.get("order_id") ?? "");
  const approved: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^approved\[([0-9a-f-]{36})\]$/i);
    if (!match) continue;
    const itemId = match[1]!;
    const n = Number.parseInt(String(value), 10);
    approved[itemId] = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const parsed = ApproveOrderInput.safeParse({ order_id, approved });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const order = await loadOrder(supabase, parsed.data.order_id);
  if (!order) return { error: "Order not found" };
  if (order.status !== "submitted") {
    return {
      error: `Can only branch-approve orders in 'submitted' state (was ${order.status})`,
    };
  }

  // Branch managers approve their own branch; super_admin / administration
  // can approve any. HQ Manager is NOT permitted at step 1 — that's the
  // explicit non-substitution rule from SPEC §8.2.
  const canApprove =
    isAdmin(session.roles) ||
    session.roles.some(
      (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
    );
  if (!canApprove) return { error: "Forbidden" };

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quantity_requested")
    .eq("order_id", order.id);
  if (!items || items.length === 0) {
    return { error: "Order has no items" };
  }

  type ItemUpdate = {
    id: string;
    product_id: string;
    quantity_requested: number;
    quantity_approved: number;
  };
  const updates: ItemUpdate[] = [];
  for (const item of items) {
    const submitted = parsed.data.approved[item.id];
    const approvedQty =
      submitted === undefined
        ? item.quantity_requested
        : Math.min(submitted, item.quantity_requested);
    updates.push({
      id: item.id,
      product_id: item.product_id,
      quantity_requested: item.quantity_requested,
      quantity_approved: approvedQty,
    });
  }

  // Backorder flag — any approved qty exceeds available?
  const productIds = Array.from(new Set(updates.map((u) => u.product_id)));
  const { data: invRows } = await supabase
    .from("inventory")
    .select("product_id, quantity_on_hand, quantity_reserved")
    .in("product_id", productIds);
  const invByProduct = new Map(
    (invRows ?? []).map((r) => [r.product_id, r]),
  );
  let backorder = false;
  for (const u of updates) {
    if (u.quantity_approved <= 0) continue;
    const inv = invByProduct.get(u.product_id);
    const avail = Math.max(
      0,
      (inv?.quantity_on_hand ?? 0) - (inv?.quantity_reserved ?? 0),
    );
    if (u.quantity_approved > avail) backorder = true;
  }

  for (const u of updates) {
    const { error: updErr } = await supabase
      .from("order_items")
      .update({ quantity_approved: u.quantity_approved })
      .eq("id", u.id);
    if (updErr) return { error: updErr.message };
  }

  // Reservation movements per positive approved line.
  const movementRows = updates
    .filter((u) => u.quantity_approved > 0)
    .map((u) => ({
      product_id: u.product_id,
      delta: -u.quantity_approved,
      reason: "order_reserved" as const,
      reference_type: "order",
      reference_id: order.id,
      actor_user_id: session.user.id,
    }));
  if (movementRows.length > 0) {
    const adm = createAdminClient();
    const { error: movErr } = await adm
      .from("inventory_movements")
      .insert(movementRows);
    if (movErr) return { error: movErr.message };

    for (const u of updates.filter((x) => x.quantity_approved > 0)) {
      const inv = invByProduct.get(u.product_id);
      const nextReserved = (inv?.quantity_reserved ?? 0) + u.quantity_approved;
      if (inv) {
        await adm
          .from("inventory")
          .update({ quantity_reserved: nextReserved })
          .eq("product_id", u.product_id);
      } else {
        await adm.from("inventory").insert({
          product_id: u.product_id,
          quantity_on_hand: 0,
          quantity_reserved: u.quantity_approved,
        });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const { data: headRows, error: headErr } = await supabase
    .from("orders")
    .update({
      status: "branch_approved",
      branch_approved_at: nowIso,
      branch_approved_by_user_id: session.user.id,
    })
    .eq("id", order.id)
    .eq("status", "submitted")
    .select("id");
  if (headErr) return { error: headErr.message };
  if (!headRows || headRows.length === 0) {
    return {
      error:
        "Order header update affected 0 rows — RLS rejected the write or the status was changed concurrently.",
    };
  }

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "branch_approve",
    actor_user_id: session.user.id,
    before_json: { status: "submitted" } as Json,
    after_json: {
      status: "branch_approved",
      backorder,
      approved_lines: updates.map((u) => ({
        item_id: u.id,
        product_id: u.product_id,
        approved: u.quantity_approved,
        requested: u.quantity_requested,
      })),
    } as unknown as Json,
  });

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { success: true };
}

export async function branchApproveOrderFormAction(
  formData: FormData,
): Promise<void> {
  const result = await branchApproveOrder(undefined, formData);
  const orderId = String(formData.get("order_id") ?? "");
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    redirect(`/orders/${orderId}?${qs.toString()}`);
  }
  redirect(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Step 2 — HQ Manager approval (branch_approved → approved)
// ---------------------------------------------------------------------------

/**
 * HQ Manager approves at step 2. Per SPEC §8.2:
 *  - HQ does NOT adjust quantities (that's the Branch Manager's call).
 *  - No new reservations — those landed at step 1.
 *  - On success: status flips to `approved`; the order is now visible to
 *    the packer queue.
 */
export async function hqApproveOrder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const order_id = String(formData.get("order_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(order_id)) {
    return { error: "Invalid order id" };
  }

  const supabase = createClient();
  const order = await loadOrder(supabase, order_id);
  if (!order) return { error: "Order not found" };
  if (order.status !== "branch_approved") {
    return {
      error: `Can only HQ-approve orders in 'branch_approved' state (was ${order.status})`,
    };
  }

  const canApprove = isAdmin(session.roles) || isHqManager(session.roles);
  if (!canApprove) return { error: "Forbidden" };

  const nowIso = new Date().toISOString();
  const { data: headRows, error: headErr } = await supabase
    .from("orders")
    .update({
      status: "approved",
      approved_at: nowIso,
      approved_by_user_id: session.user.id,
    })
    .eq("id", order.id)
    .eq("status", "branch_approved")
    .select("id");
  if (headErr) return { error: headErr.message };
  if (!headRows || headRows.length === 0) {
    return {
      error:
        "Order header update affected 0 rows — RLS rejected the write or the status was changed concurrently.",
    };
  }

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "hq_approve",
    actor_user_id: session.user.id,
    before_json: { status: "branch_approved" } as Json,
    after_json: { status: "approved" } as unknown as Json,
  });

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { success: true };
}

export async function hqApproveOrderFormAction(formData: FormData): Promise<void> {
  const result = await hqApproveOrder(undefined, formData);
  const orderId = String(formData.get("order_id") ?? "");
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    redirect(`/orders/${orderId}?${qs.toString()}`);
  }
  redirect(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Reject — accepts both source states
// ---------------------------------------------------------------------------

/**
 * Reject an order at either step.
 *  - From `submitted`: BM-of-branch or admin can reject. No reservations
 *    to release (none made yet at step 1).
 *  - From `branch_approved`: HQ Manager or admin can reject. Reservations
 *    made at step 1 must be released.
 */
export async function rejectOrder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const parsed = RejectOrderInput.safeParse({
    order_id: formData.get("order_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: { reason: parsed.error.issues[0]?.message ?? "Invalid" },
    };
  }

  const supabase = createClient();
  const order = await loadOrder(supabase, parsed.data.order_id);
  if (!order) return { error: "Order not found" };
  if (order.status !== "submitted" && order.status !== "branch_approved") {
    return {
      error: `Can only reject orders in 'submitted' or 'branch_approved' state (was ${order.status})`,
    };
  }

  const fromBranch = order.status === "submitted";
  const canReject = fromBranch
    ? isAdmin(session.roles) ||
      session.roles.some(
        (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
      )
    : // From branch_approved → only HQ + admin (BM's window is closed).
      isAdmin(session.roles) || isHqManager(session.roles);
  if (!canReject) return { error: "Forbidden" };

  // If rejecting at step 2, release the reservations we made at step 1.
  if (!fromBranch) {
    await releaseReservationsFor(supabase, order.id, session.user.id);
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      // Stamp the *step-2 actor* into approved_by_user_id when the rejection
      // happens at step 2; for step-1 rejection this stays null. The
      // approved_at column doubles as a "decided_at" marker so the
      // existing /orders Approved-by column shows who rejected.
      approved_at: nowIso,
      approved_by_user_id: session.user.id,
    })
    .eq("id", order.id)
    .in("status", ["submitted", "branch_approved"]);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: fromBranch ? "branch_reject" : "hq_reject",
    actor_user_id: session.user.id,
    before_json: { status: order.status } as Json,
    after_json: {
      status: "rejected",
      reason: parsed.data.reason,
      step: fromBranch ? "branch" : "hq",
    } as unknown as Json,
  });

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { success: true };
}

export async function rejectOrderFormAction(formData: FormData): Promise<void> {
  const result = await rejectOrder(undefined, formData);
  const orderId = String(formData.get("order_id") ?? "");
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    redirect(`/orders/${orderId}?${qs.toString()}`);
  }
  redirect(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Cancel — pre-shipped
// ---------------------------------------------------------------------------

/**
 * Cancel an order from any pre-shipped state. For any state with reserved
 * inventory (branch_approved, approved, picking) we reverse the reservation
 * via `order_released` movements and decrement `inventory.quantity_reserved`.
 *
 * Permission matrix:
 *   - draft: creator + branch_manager + admin
 *   - submitted | branch_approved | approved | picking:
 *       branch_manager_of_branch, hq_operations_manager, administration,
 *       super_admin
 */
export async function cancelOrder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const parsed = CancelOrderInput.safeParse({
    order_id: formData.get("order_id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Invalid input" };

  const supabase = createClient();
  const order = await loadOrder(supabase, parsed.data.order_id);
  if (!order) return { error: "Order not found" };

  const cancellable = [
    "draft",
    "submitted",
    "branch_approved",
    "approved",
    "picking",
  ] as const;
  if (!(cancellable as readonly string[]).includes(order.status)) {
    return { error: `Cannot cancel order in status '${order.status}'` };
  }

  const canCancel =
    isAdmin(session.roles) ||
    isHqManager(session.roles) ||
    session.roles.some(
      (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
    ) ||
    (order.status === "draft" && order.created_by_user_id === session.user.id);
  if (!canCancel) return { error: "Forbidden" };

  // Release reservations if any were made (step 1 onwards).
  if (
    order.status === "branch_approved" ||
    order.status === "approved" ||
    order.status === "picking"
  ) {
    await releaseReservationsFor(supabase, order.id, session.user.id);
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      notes: parsed.data.reason ?? null,
    })
    .eq("id", order.id)
    .in("status", cancellable);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "cancel",
    actor_user_id: session.user.id,
    before_json: { status: order.status } as Json,
    after_json: {
      status: "cancelled",
      reason: parsed.data.reason,
    } as unknown as Json,
  });

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { success: true };
}

export async function cancelOrderFormAction(formData: FormData): Promise<void> {
  const result = await cancelOrder(undefined, formData);
  const orderId = String(formData.get("order_id") ?? "");
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    redirect(`/orders/${orderId}?${qs.toString()}`);
  }
  redirect(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Internal — release-reservations helper shared by cancel + HQ-reject
// ---------------------------------------------------------------------------

async function releaseReservationsFor(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  actorUserId: string,
): Promise<void> {
  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity_approved")
    .eq("order_id", orderId);
  const rows = (items ?? []).filter(
    (it): it is { product_id: string; quantity_approved: number } =>
      typeof it.quantity_approved === "number" && it.quantity_approved > 0,
  );
  if (rows.length === 0) return;

  const adm = createAdminClient();
  const movements = rows.map((r) => ({
    product_id: r.product_id,
    delta: r.quantity_approved,
    reason: "order_released" as const,
    reference_type: "order",
    reference_id: orderId,
    actor_user_id: actorUserId,
  }));
  await adm.from("inventory_movements").insert(movements);

  const { data: invRows } = await adm
    .from("inventory")
    .select("product_id, quantity_reserved")
    .in("product_id", Array.from(new Set(rows.map((r) => r.product_id))));
  const current = new Map(
    (invRows ?? []).map((r) => [r.product_id, r.quantity_reserved]),
  );
  for (const r of rows) {
    const prior = current.get(r.product_id) ?? 0;
    const next = Math.max(0, prior - r.quantity_approved);
    await adm
      .from("inventory")
      .update({ quantity_reserved: next })
      .eq("product_id", r.product_id);
    current.set(r.product_id, next);
  }
}
