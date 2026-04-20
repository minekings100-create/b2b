"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";
import { notify } from "@/lib/email/notify";
import { adminAudience, userById } from "@/lib/email/recipients";
import {
  renderReturnApproved,
  renderReturnReceived,
  renderReturnRejected,
  renderReturnRequested,
} from "@/lib/email/templates";

/**
 * Phase 6 — RMA server actions (SPEC §8.7).
 *
 * State machine: requested → approved/rejected (admin).
 *                approved → received (admin; with per-item restock +
 *                resolution recorded on receive).
 *                received → closed (admin; terminal).
 *
 * Money flows (refund / credit_note resolutions) are DEFERRED to a
 * Phase 6 follow-up PR. This action layer records the intended
 * resolution on each return_item at receive time, but the actual
 * financial effect (negative invoice lines, credit balance against
 * open invoices) is not executed. See PR description under the
 * "deferred" section.
 *
 * Only `replace` is fully functional: receive triggers the creation
 * of a new linked order at status='approved' (skipping approval,
 * per SPEC §8.7 step 3). Restockable items flow through
 * `inventory_movements` with reason `return_in`.
 */

type Condition = Database["public"]["Enums"]["return_item_condition"];
type Resolution = Database["public"]["Enums"]["return_item_resolution"];

export type ReturnActionState =
  | undefined
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const CreateReturnInput = z.object({
  order_id: z.string().uuid(),
  reason: z.string().max(500).optional().default(""),
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(9999),
        condition: z.enum(["damaged", "wrong_item", "surplus", "other"]),
      }),
    )
    .min(1, "Pick at least one line to return"),
});

const RejectInput = z.object({
  return_id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Give the branch a one-line reason")
    .max(500),
});

const ReturnIdInput = z.object({ return_id: z.string().uuid() });

const ReceiveInput = z.object({
  return_id: z.string().uuid(),
  resolutions: z
    .array(
      z.object({
        return_item_id: z.string().uuid(),
        // v1: `replace` is actionable; refund / credit_note are
        // recorded in the data model but not executed (follow-up PR
        // per Phase 6 PAUSE rules on money flows).
        resolution: z.enum(["replace", "refund", "credit_note", ""]),
        restock: z
          .preprocess(
            (v) => (v === "on" || v === "true" || v === true ? true : false),
            z.boolean(),
          )
          .default(false),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function allocateRmaNumber(
  adm: ReturnType<typeof createAdminClient>,
  at: Date = new Date(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const { data, error } = await adm.rpc("allocate_sequence", {
    p_key: `rma_${year}`,
  });
  if (error) throw new Error(`allocate_sequence rma: ${error.message}`);
  return `RMA-${year}-${String(data ?? 0).padStart(5, "0")}`;
}

function readItemsFromForm(
  formData: FormData,
): Array<{
  order_item_id: string;
  quantity: number;
  condition: Condition;
}> {
  // Form field shape: `item[<order_item_id>].{quantity,condition}`.
  // We only include lines where the user set qty >= 1.
  const bucket = new Map<
    string,
    { quantity?: number; condition?: Condition }
  >();
  for (const [key, value] of formData.entries()) {
    const qtyMatch = /^item\[([0-9a-fA-F-]{36})\]\.quantity$/.exec(key);
    if (qtyMatch) {
      const n = Number.parseInt(String(value), 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      const id = qtyMatch[1]!;
      const cur = bucket.get(id) ?? {};
      cur.quantity = n;
      bucket.set(id, cur);
      continue;
    }
    const condMatch = /^item\[([0-9a-fA-F-]{36})\]\.condition$/.exec(key);
    if (condMatch) {
      const id = condMatch[1]!;
      const cur = bucket.get(id) ?? {};
      cur.condition = String(value) as Condition;
      bucket.set(id, cur);
    }
  }
  const out: Array<{
    order_item_id: string;
    quantity: number;
    condition: Condition;
  }> = [];
  for (const [id, v] of bucket.entries()) {
    if (v.quantity && v.condition) {
      out.push({ order_item_id: id, quantity: v.quantity, condition: v.condition });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// createReturn — branch user opens an RMA
// ---------------------------------------------------------------------------

export async function createReturn(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !hasAnyRole(session.roles, [
      "branch_user",
      "branch_manager",
      "administration",
      "super_admin",
    ])
  ) {
    return { ok: false, error: "You can't open returns on this account." };
  }

  const parsed = CreateReturnInput.safeParse({
    order_id: formData.get("order_id"),
    reason: formData.get("reason") ?? "",
    items: readItemsFromForm(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { order_id, reason, items } = parsed.data;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, status, branch_id,
       order_items ( id, quantity_approved )`,
    )
    .eq("id", order_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.status !== "delivered" && order.status !== "closed") {
    return {
      ok: false,
      error: `Can only open returns on delivered orders (was ${order.status}).`,
    };
  }

  // Bound every return qty to the original approved qty.
  const approvedById = new Map(
    (order.order_items ?? []).map((i) => [i.id, i.quantity_approved ?? 0]),
  );
  for (const it of items) {
    const approved = approvedById.get(it.order_item_id);
    if (approved === undefined) {
      return { ok: false, error: "Unknown order line in return" };
    }
    if (it.quantity > approved) {
      return {
        ok: false,
        error: `Cannot return more than ${approved} of line ${it.order_item_id}`,
      };
    }
  }

  const adm = createAdminClient();
  const rmaNumber = await allocateRmaNumber(adm);

  // Branch user writes the return row via session client so the
  // `returns_insert` RLS policy is honoured (branch_user on own branch).
  const { data: inserted, error: insErr } = await supabase
    .from("returns")
    .insert({
      rma_number: rmaNumber,
      order_id,
      branch_id: order.branch_id,
      requested_by_user_id: session.user.id,
      reason: reason || null,
      status: "requested",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      ok: false,
      error: insErr?.message ?? "Couldn't create return — please try again",
    };
  }

  const { error: itemsErr } = await supabase.from("return_items").insert(
    items.map((i) => ({
      return_id: inserted.id,
      order_item_id: i.order_item_id,
      quantity: i.quantity,
      condition: i.condition,
    })),
  );
  if (itemsErr) {
    return { ok: false, error: itemsErr.message };
  }

  await adm.from("audit_log").insert({
    entity_type: "return",
    entity_id: inserted.id,
    action: "return_requested",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      rma_number: rmaNumber,
      order_id,
      item_count: items.length,
      reason: reason || null,
    } as unknown as Json,
  });

  // Email admins so they see the request land in /returns.
  await emitReturnRequested(inserted.id, rmaNumber, order_id, order.branch_id).catch(
    (e) => {
      // eslint-disable-next-line no-console
      console.error(
        `[notify] return_requested side-effect failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    },
  );

  revalidatePath("/returns");
  revalidatePath(`/orders/${order_id}`);
  redirect(`/returns/${inserted.id}`);
}

// ---------------------------------------------------------------------------
// approveReturn / rejectReturn (admin)
// ---------------------------------------------------------------------------

export async function approveReturn(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) {
    return { ok: false, error: "Administrator role required" };
  }
  const parsed = ReturnIdInput.safeParse({
    return_id: formData.get("return_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("returns")
    .select("id, status, rma_number, branch_id, order_id, requested_by_user_id")
    .eq("id", parsed.data.return_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Return not found" };
  if (current.status !== "requested") {
    return {
      ok: false,
      error: `Can only approve returns in status 'requested' (was ${current.status}).`,
    };
  }

  const { data: updated } = await adm
    .from("returns")
    .update({ status: "approved" })
    .eq("id", current.id)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Return state changed under you — refresh and try again.",
    };
  }

  await adm.from("audit_log").insert({
    entity_type: "return",
    entity_id: current.id,
    action: "return_approved",
    actor_user_id: session.user.id,
    before_json: { status: "requested" } as Json,
    after_json: { status: "approved", rma_number: current.rma_number } as Json,
  });

  await emitReturnApproved(
    current.id,
    current.rma_number,
    current.requested_by_user_id,
    current.branch_id,
  ).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] return_approved side-effect failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  revalidatePath("/returns");
  revalidatePath(`/returns/${current.id}`);
  return { ok: true, message: "Return approved" };
}

export async function rejectReturn(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) {
    return { ok: false, error: "Administrator role required" };
  }
  const parsed = RejectInput.safeParse({
    return_id: formData.get("return_id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: { reason: "A reason is required" },
    };
  }

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("returns")
    .select(
      "id, status, rma_number, branch_id, order_id, requested_by_user_id, notes",
    )
    .eq("id", parsed.data.return_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Return not found" };
  if (current.status !== "requested") {
    return {
      ok: false,
      error: `Can only reject returns in status 'requested' (was ${current.status}).`,
    };
  }

  const { data: updated } = await adm
    .from("returns")
    .update({ status: "rejected", notes: parsed.data.reason })
    .eq("id", current.id)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Return state changed under you — refresh and try again.",
    };
  }

  await adm.from("audit_log").insert({
    entity_type: "return",
    entity_id: current.id,
    action: "return_rejected",
    actor_user_id: session.user.id,
    before_json: { status: "requested" } as Json,
    after_json: {
      status: "rejected",
      rma_number: current.rma_number,
      reason: parsed.data.reason,
    } as unknown as Json,
  });

  await emitReturnRejected(
    current.id,
    current.rma_number,
    parsed.data.reason,
    current.requested_by_user_id,
  ).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] return_rejected side-effect failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  revalidatePath("/returns");
  revalidatePath(`/returns/${current.id}`);
  return { ok: true, message: "Return rejected" };
}

// ---------------------------------------------------------------------------
// receiveReturn (admin) — physical receipt + per-item resolution + restock
// ---------------------------------------------------------------------------

export async function receiveReturn(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) {
    return { ok: false, error: "Administrator role required" };
  }

  const return_id = String(formData.get("return_id") ?? "");
  const resolutions: Array<{
    return_item_id: string;
    resolution: Resolution | "";
    restock: boolean;
  }> = [];
  const bucket = new Map<
    string,
    { resolution?: Resolution | ""; restock?: boolean }
  >();
  for (const [key, value] of formData.entries()) {
    const mRes = /^resolution\[([0-9a-fA-F-]{36})\]$/.exec(key);
    if (mRes) {
      const id = mRes[1]!;
      const cur = bucket.get(id) ?? {};
      const v = String(value);
      cur.resolution = (v === "" ? "" : (v as Resolution));
      bucket.set(id, cur);
      continue;
    }
    const mRestock = /^restock\[([0-9a-fA-F-]{36})\]$/.exec(key);
    if (mRestock) {
      const id = mRestock[1]!;
      const cur = bucket.get(id) ?? {};
      cur.restock = String(value) === "on" || String(value) === "true";
      bucket.set(id, cur);
    }
  }
  for (const [id, v] of bucket.entries()) {
    resolutions.push({
      return_item_id: id,
      resolution: v.resolution ?? "",
      restock: v.restock ?? false,
    });
  }

  const parsed = ReceiveInput.safeParse({ return_id, resolutions });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("returns")
    .select(
      `id, status, rma_number, branch_id, order_id, requested_by_user_id,
       return_items (
         id, order_item_id, quantity,
         order_items!inner ( product_id )
       )`,
    )
    .eq("id", parsed.data.return_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Return not found" };
  if (current.status !== "approved") {
    return {
      ok: false,
      error: `Can only receive returns in status 'approved' (was ${current.status}).`,
    };
  }

  // Index return_items for quick lookup.
  const returnItemById = new Map(
    (current.return_items ?? []).map((ri) => [ri.id, ri] as const),
  );

  // Persist per-item resolution.
  for (const r of parsed.data.resolutions) {
    const item = returnItemById.get(r.return_item_id);
    if (!item) continue;
    const { error } = await adm
      .from("return_items")
      .update({
        resolution: r.resolution === "" ? null : r.resolution,
      })
      .eq("id", r.return_item_id);
    if (error) return { ok: false, error: error.message };
  }

  // Flip header status.
  const { data: updated } = await adm
    .from("returns")
    .update({ status: "received" })
    .eq("id", current.id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Return state changed under you — refresh and try again.",
    };
  }

  // Inventory accounting — per item, if admin flagged restock=true,
  // write a `return_in` movement and bump quantity_on_hand.
  for (const r of parsed.data.resolutions) {
    if (!r.restock) continue;
    const item = returnItemById.get(r.return_item_id);
    if (!item) continue;
    const productId = item.order_items!.product_id;
    await adm.from("inventory_movements").insert({
      product_id: productId,
      delta: item.quantity,
      reason: "return_in" as const,
      reference_type: "return",
      reference_id: current.id,
      actor_user_id: session.user.id,
    });
    const { data: inv } = await adm
      .from("inventory")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .maybeSingle();
    if (inv) {
      await adm
        .from("inventory")
        .update({ quantity_on_hand: inv.quantity_on_hand + item.quantity })
        .eq("product_id", productId);
    }
  }

  // Replace resolution → auto-create a linked order at status='approved'
  // (skips approval per SPEC §8.7). Single new order with every replace
  // item on it — matches the "one order per return" shape so reporting
  // stays simple.
  const replaceItems = parsed.data.resolutions
    .filter((r) => r.resolution === "replace")
    .map((r) => returnItemById.get(r.return_item_id))
    .filter((i): i is NonNullable<typeof i> => !!i);
  let replacementOrderId: string | null = null;
  if (replaceItems.length > 0) {
    replacementOrderId = await createReplacementOrder({
      adm,
      originalOrderId: current.order_id,
      branchId: current.branch_id,
      requestedByUserId: current.requested_by_user_id,
      replaceItems: replaceItems.map((it) => ({
        product_id: it.order_items!.product_id,
        quantity: it.quantity,
      })),
      rmaNumber: current.rma_number,
      actorUserId: session.user.id,
    });
  }

  await adm.from("audit_log").insert({
    entity_type: "return",
    entity_id: current.id,
    action: "return_received",
    actor_user_id: session.user.id,
    before_json: { status: "approved" } as Json,
    after_json: {
      status: "received",
      rma_number: current.rma_number,
      resolutions: parsed.data.resolutions,
      replacement_order_id: replacementOrderId,
    } as unknown as Json,
  });

  await emitReturnReceived(
    current.id,
    current.rma_number,
    current.requested_by_user_id,
  ).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] return_received side-effect failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  revalidatePath("/returns");
  revalidatePath(`/returns/${current.id}`);
  revalidatePath(`/orders`);
  return { ok: true, message: "Return received" };
}

async function createReplacementOrder(opts: {
  adm: ReturnType<typeof createAdminClient>;
  originalOrderId: string;
  branchId: string;
  requestedByUserId: string;
  replaceItems: Array<{ product_id: string; quantity: number }>;
  rmaNumber: string;
  actorUserId: string;
}): Promise<string> {
  const { adm } = opts;
  const year = new Date().getUTCFullYear();
  const { data: nextValue } = await adm.rpc("allocate_sequence", {
    p_key: `orders_${year}`,
  });
  const orderNumber = `ORD-${year}-${String(nextValue ?? 1).padStart(4, "0")}`;
  const nowIso = new Date().toISOString();

  const { data: order, error: orderErr } = await adm
    .from("orders")
    .insert({
      order_number: orderNumber,
      branch_id: opts.branchId,
      created_by_user_id: opts.requestedByUserId,
      status: "approved",
      submitted_at: nowIso,
      branch_approved_at: nowIso,
      branch_approved_by_user_id: opts.actorUserId,
      approved_at: nowIso,
      approved_by_user_id: opts.actorUserId,
      notes: `Replacement for ${opts.rmaNumber}`,
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    throw new Error(
      `replacement order insert failed: ${orderErr?.message ?? "no row"}`,
    );
  }

  // Snapshot prices from products at creation time.
  const productIds = Array.from(
    new Set(opts.replaceItems.map((i) => i.product_id)),
  );
  const { data: products } = await adm
    .from("products")
    .select("id, unit_price_cents, vat_rate")
    .in("id", productIds);
  const byProduct = new Map(
    (products ?? []).map((p) => [p.id, p] as const),
  );

  let totalNet = 0;
  let totalVat = 0;
  const itemRows = opts.replaceItems.map((i) => {
    const p = byProduct.get(i.product_id);
    const unitPrice = p?.unit_price_cents ?? 0;
    const vatRate = p?.vat_rate ?? 21;
    const lineNet = unitPrice * i.quantity;
    totalNet += lineNet;
    totalVat += Math.round((lineNet * vatRate) / 100);
    return {
      order_id: order.id,
      product_id: i.product_id,
      quantity_requested: i.quantity,
      quantity_approved: i.quantity,
      unit_price_cents_snapshot: unitPrice,
      vat_rate_snapshot: vatRate,
      line_net_cents: lineNet,
    };
  });
  if (itemRows.length > 0) {
    await adm.from("order_items").insert(itemRows);
  }
  await adm
    .from("orders")
    .update({
      total_net_cents: totalNet,
      total_vat_cents: totalVat,
      total_gross_cents: totalNet + totalVat,
    })
    .eq("id", order.id);

  await adm.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "order_replacement_created",
    actor_user_id: opts.actorUserId,
    before_json: null,
    after_json: {
      order_number: orderNumber,
      rma_number: opts.rmaNumber,
      replacement_for_order: opts.originalOrderId,
      line_count: itemRows.length,
      total_gross_cents: totalNet + totalVat,
    } as unknown as Json,
  });

  return order.id;
}

// ---------------------------------------------------------------------------
// closeReturn (admin) — received → closed
// ---------------------------------------------------------------------------

export async function closeReturn(
  _prev: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) {
    return { ok: false, error: "Administrator role required" };
  }
  const parsed = ReturnIdInput.safeParse({
    return_id: formData.get("return_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const adm = createAdminClient();
  const { data: current } = await adm
    .from("returns")
    .select("id, status, rma_number")
    .eq("id", parsed.data.return_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Return not found" };
  if (current.status !== "received") {
    return {
      ok: false,
      error: `Can only close returns in status 'received' (was ${current.status}).`,
    };
  }

  const { data: updated } = await adm
    .from("returns")
    .update({ status: "closed", processed_at: new Date().toISOString() })
    .eq("id", current.id)
    .eq("status", "received")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: false,
      error: "Return state changed under you — refresh and try again.",
    };
  }

  await adm.from("audit_log").insert({
    entity_type: "return",
    entity_id: current.id,
    action: "return_closed",
    actor_user_id: session.user.id,
    before_json: { status: "received" } as Json,
    after_json: { status: "closed", rma_number: current.rma_number } as Json,
  });

  revalidatePath("/returns");
  revalidatePath(`/returns/${current.id}`);
  return { ok: true, message: "Return closed" };
}

// ---------------------------------------------------------------------------
// Notification emitters
// ---------------------------------------------------------------------------

async function emitReturnRequested(
  returnId: string,
  rmaNumber: string,
  orderId: string,
  branchId: string,
): Promise<void> {
  const adm = createAdminClient();
  const { data: branch } = await adm
    .from("branches")
    .select("branch_code, name")
    .eq("id", branchId)
    .maybeSingle();
  const { data: order } = await adm
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  const recipients = await adminAudience(adm);
  if (recipients.length === 0) return;
  const rendered = renderReturnRequested({
    return_id: returnId,
    rma_number: rmaNumber,
    order_number: order?.order_number ?? "—",
    branch_code: branch?.branch_code ?? "—",
    branch_name: branch?.name ?? "—",
  });
  await notify({
    db: adm,
    type: "return_requested",
    recipients,
    rendered,
    payload: {
      return_id: returnId,
      rma_number: rmaNumber,
      order_number: order?.order_number ?? null,
      branch_code: branch?.branch_code ?? null,
      href: `/returns/${returnId}`,
    },
  });
}

async function emitReturnApproved(
  returnId: string,
  rmaNumber: string,
  requestedByUserId: string,
  branchId: string,
): Promise<void> {
  const adm = createAdminClient();
  const creator = await userById(adm, requestedByUserId);
  if (!creator) return;
  const { data: branch } = await adm
    .from("branches")
    .select("branch_code")
    .eq("id", branchId)
    .maybeSingle();
  const rendered = renderReturnApproved({
    return_id: returnId,
    rma_number: rmaNumber,
    branch_code: branch?.branch_code ?? "—",
  });
  await notify({
    db: adm,
    type: "return_approved",
    recipients: [creator],
    rendered,
    payload: {
      return_id: returnId,
      rma_number: rmaNumber,
      branch_code: branch?.branch_code ?? null,
      href: `/returns/${returnId}`,
    },
  });
}

async function emitReturnRejected(
  returnId: string,
  rmaNumber: string,
  reason: string,
  requestedByUserId: string,
): Promise<void> {
  const adm = createAdminClient();
  const creator = await userById(adm, requestedByUserId);
  if (!creator) return;
  const rendered = renderReturnRejected({
    return_id: returnId,
    rma_number: rmaNumber,
    reason,
  });
  await notify({
    db: adm,
    type: "return_rejected",
    recipients: [creator],
    rendered,
    payload: {
      return_id: returnId,
      rma_number: rmaNumber,
      reason,
      href: `/returns/${returnId}`,
    },
  });
}

async function emitReturnReceived(
  returnId: string,
  rmaNumber: string,
  requestedByUserId: string,
): Promise<void> {
  const adm = createAdminClient();
  const creator = await userById(adm, requestedByUserId);
  if (!creator) return;
  const rendered = renderReturnReceived({
    return_id: returnId,
    rma_number: rmaNumber,
  });
  await notify({
    db: adm,
    type: "return_received",
    recipients: [creator],
    rendered,
    payload: {
      return_id: returnId,
      rma_number: rmaNumber,
      href: `/returns/${returnId}`,
    },
  });
}
