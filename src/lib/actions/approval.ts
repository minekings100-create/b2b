"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  ApproveOrderInput,
  CancelOrderInput,
  RejectOrderInput,
} from "@/lib/validation/approval";
import type { Json } from "@/lib/supabase/types";

/**
 * Inventory movements + `inventory.quantity_reserved` writes deliberately
 * use the service-role client. RLS on those tables only admits super_admin
 * / administration / packer — branch_manager is not listed, but SPEC §8.2
 * requires managers to approve orders (and approval creates reservation
 * movements). The application layer above the inventory writes enforces
 * that the caller is isAdmin() or the branch_manager of the order's
 * branch — strictly tighter than the RLS check — so the bypass is safe.
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
  approved_by_user_id: string | null;
};

async function loadOrder(
  supabase: ReturnType<typeof createClient>,
  id: string,
): Promise<Order | null> {
  const { data } = await supabase
    .from("orders")
    .select("id, branch_id, status, created_by_user_id, approved_by_user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Order | null) ?? null;
}

/**
 * Manager approves an order. Per SPEC §8.2:
 *  - Each line's `quantity_approved` may be adjusted downward from
 *    `quantity_requested`; 0 effectively skips that line.
 *  - Approved quantities create `inventory_movements` rows with
 *    `reason='order_reserved'` and bump `inventory.quantity_reserved`.
 *  - If any approved qty exceeds on-hand − reserved the order goes through
 *    anyway (backorder) and we flag it on the audit entry.
 */
export async function approveOrder(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const order_id = String(formData.get("order_id") ?? "");
  // Collect approved[itemId]=N pairs.
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
      error: `Can only approve orders in 'submitted' state (was ${order.status})`,
    };
  }

  // Role + branch check. Managers can approve their own branch; super_admin
  // and administration can approve any. The `orders_update` RLS policy also
  // enforces this.
  const canApprove =
    isAdmin(session.roles) ||
    session.roles.some(
      (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
    );
  if (!canApprove) return { error: "Forbidden" };

  // Load line items so we can cap approved ≤ requested and fetch product ids.
  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quantity_requested")
    .eq("order_id", order.id);
  if (!items || items.length === 0) {
    return { error: "Order has no items" };
  }

  // Build update payloads + reservation plan.
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

  // Check for backorder — any approved qty > (on_hand − reserved).
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

  // Apply line-level approvals.
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from("order_items")
      .update({ quantity_approved: u.quantity_approved })
      .eq("id", u.id);
    if (updErr) return { error: updErr.message };
  }

  // Reservations per positive approved line. Bypass RLS via the
  // service-role client (see top-of-file comment) — application gate
  // above already enforces manager-of-branch or admin.
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

  // Flip the header. `.select()` forces the update to return affected rows
  // so we can detect silent 0-row updates (RLS rejected / status raced).
  const nowIso = new Date().toISOString();
  const { data: headRows, error: headErr } = await supabase
    .from("orders")
    .update({
      status: "approved",
      approved_at: nowIso,
      approved_by_user_id: session.user.id,
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
    action: "approve",
    actor_user_id: session.user.id,
    before_json: { status: "submitted" } as Json,
    after_json: {
      status: "approved",
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

export async function approveOrderFormAction(formData: FormData): Promise<void> {
  const result = await approveOrder(undefined, formData);
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    const orderId = String(formData.get("order_id") ?? "");
    redirect(`/orders/${orderId}?${qs.toString()}`);
  }
  redirect(`/orders/${String(formData.get("order_id") ?? "")}`);
}

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
  if (order.status !== "submitted") {
    return { error: `Can only reject submitted orders (was ${order.status})` };
  }
  const canReject =
    isAdmin(session.roles) ||
    session.roles.some(
      (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
    );
  if (!canReject) return { error: "Forbidden" };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      approved_at: nowIso,
      approved_by_user_id: session.user.id,
    })
    .eq("id", order.id)
    .eq("status", "submitted");
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "reject",
    actor_user_id: session.user.id,
    before_json: { status: "submitted" } as Json,
    after_json: {
      status: "rejected",
      reason: parsed.data.reason,
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

/**
 * Cancel an order from any pre-shipped state. For approved orders we reverse
 * the reservation via `order_released` movements and decrement
 * `inventory.quantity_reserved`.
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
    "approved",
    "picking",
  ] as const;
  if (
    !(cancellable as readonly string[]).includes(order.status)
  ) {
    return { error: `Cannot cancel order in status '${order.status}'` };
  }

  const canCancel =
    isAdmin(session.roles) ||
    session.roles.some(
      (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
    ) ||
    // Allow branch users to cancel their own drafts.
    (order.status === "draft" && order.created_by_user_id === session.user.id);
  if (!canCancel) return { error: "Forbidden" };

  // If approved, release reservations. Same RLS story as approve — use
  // the service-role client for the inventory side.
  if (order.status === "approved" || order.status === "picking") {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, quantity_approved")
      .eq("order_id", order.id);
    const rows = (items ?? []).filter(
      (it): it is { product_id: string; quantity_approved: number } =>
        typeof it.quantity_approved === "number" && it.quantity_approved > 0,
    );
    if (rows.length > 0) {
      const adm = createAdminClient();
      const movements = rows.map((r) => ({
        product_id: r.product_id,
        delta: r.quantity_approved,
        reason: "order_released" as const,
        reference_type: "order",
        reference_id: order.id,
        actor_user_id: session.user.id,
      }));
      await adm.from("inventory_movements").insert(movements);
      const { data: invRows } = await adm
        .from("inventory")
        .select("product_id, quantity_reserved")
        .in(
          "product_id",
          Array.from(new Set(rows.map((r) => r.product_id))),
        );
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

