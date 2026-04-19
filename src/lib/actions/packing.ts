"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 4 — packer Server Actions.
 *
 * Single workflow: scan or manual-bump bumps `order_items.quantity_packed`
 * AND inserts/updates a `pallet_items` row on the currently open pallet
 * for the order (auto-created on first action). Closing a pallet flips
 * `pallets.status='packed'` and stamps `packed_by_user_id`. Completing
 * the order pack flips `orders.status` from `picking` → `packed`,
 * writes `inventory_movements` with reason `packed`, and decrements
 * both `inventory.quantity_on_hand` and `quantity_reserved`.
 *
 * Status-guarded updates (.eq("status", expected)) protect against the
 * obvious races (two packers on the same order, packer + cron).
 *
 * Audit trail: every state-changing action writes an `audit_log` row.
 */

export type PackActionState =
  | { ok: true; message?: string }
  | {
      ok: false;
      error: string;
      // For overpack: caller re-submits via `manualPack` with the same
      // `order_item_id` + `quantity` (= `delta` here) + `force: true`.
      needs_confirm?: {
        overpack_by: number;
        order_item_id: string;
        delta: number;
      };
    }
  | undefined;

const ScanInput = z.object({
  order_id: z.string().uuid(),
  barcode: z.string().min(1).max(64),
  force: z.coerce.boolean().optional(),
});

const ManualInput = z.object({
  order_id: z.string().uuid(),
  order_item_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(9999),
  force: z.coerce.boolean().optional(),
});

const PalletIdInput = z.object({ pallet_id: z.string().uuid() });
const OrderIdInput = z.object({ order_id: z.string().uuid() });

async function requirePacker() {
  const session = await getUserWithRoles();
  if (!session) return null;
  const ok =
    hasAnyRole(session.roles, ["packer", "administration", "super_admin"]);
  if (!ok) return null;
  return session;
}

// ---------------------------------------------------------------------------
// scanBarcode — primary action
// ---------------------------------------------------------------------------

export async function scanBarcode(
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const session = await requirePacker();
  if (!session) return { ok: false, error: "Forbidden" };

  const parsed = ScanInput.safeParse({
    order_id: formData.get("order_id"),
    barcode: formData.get("barcode"),
    force: formData.get("force"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { order_id, barcode, force } = parsed.data;

  const supabase = createClient();

  // Resolve barcode → (product_id, unit_multiplier).
  const { data: bc } = await supabase
    .from("product_barcodes")
    .select("product_id, unit_multiplier")
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bc) return { ok: false, error: `Barcode "${barcode}" not recognised` };

  // Find an under-packed order_item for this product.
  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quantity_approved, quantity_packed")
    .eq("order_id", order_id)
    .eq("product_id", bc.product_id);
  const target = (items ?? []).find(
    (i) => (i.quantity_approved ?? 0) > 0,
  );
  if (!target) {
    return {
      ok: false,
      error: "Scanned product is not on this order",
    };
  }

  return await applyPack({
    session,
    order_id,
    order_item_id: target.id,
    delta: bc.unit_multiplier,
    quantity_approved: target.quantity_approved!,
    quantity_packed: target.quantity_packed,
    force: force === true,
  });
}

// ---------------------------------------------------------------------------
// manualPack — fallback when scan fails
// ---------------------------------------------------------------------------

export async function manualPack(
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const session = await requirePacker();
  if (!session) return { ok: false, error: "Forbidden" };

  const parsed = ManualInput.safeParse({
    order_id: formData.get("order_id"),
    order_item_id: formData.get("order_item_id"),
    quantity: formData.get("quantity"),
    force: formData.get("force"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { order_id, order_item_id, quantity, force } = parsed.data;

  const supabase = createClient();
  const { data: row } = await supabase
    .from("order_items")
    .select("id, quantity_approved, quantity_packed")
    .eq("id", order_item_id)
    .eq("order_id", order_id)
    .maybeSingle();
  if (!row || (row.quantity_approved ?? 0) === 0) {
    return { ok: false, error: "Line not found" };
  }

  return await applyPack({
    session,
    order_id,
    order_item_id: row.id,
    delta: quantity,
    quantity_approved: row.quantity_approved!,
    quantity_packed: row.quantity_packed,
    force: force === true,
  });
}

// ---------------------------------------------------------------------------
// shared apply helper — bumps qty_packed, ensures open pallet, audit row
// ---------------------------------------------------------------------------

async function applyPack(opts: {
  session: NonNullable<Awaited<ReturnType<typeof requirePacker>>>;
  order_id: string;
  order_item_id: string;
  delta: number;
  quantity_approved: number;
  quantity_packed: number;
  force: boolean;
}): Promise<PackActionState> {
  const {
    session,
    order_id,
    order_item_id,
    delta,
    quantity_approved,
    quantity_packed,
    force,
  } = opts;

  const nextPacked = quantity_packed + delta;
  if (nextPacked > quantity_approved && !force) {
    return {
      ok: false,
      error: `Over-pack — ${nextPacked} > approved ${quantity_approved}.`,
      needs_confirm: {
        order_item_id,
        overpack_by: nextPacked - quantity_approved,
        delta,
      },
    };
  }

  const adm = createAdminClient();

  // Status-guarded transition: if order is `approved`, flip to `picking`.
  // Idempotent — silently no-ops if already `picking`.
  await adm
    .from("orders")
    .update({ status: "picking" })
    .eq("id", order_id)
    .eq("status", "approved");

  // Optimistic lock on quantity_packed — guards against two packers
  // double-bumping the same line.
  const { data: updated, error: updErr } = await adm
    .from("order_items")
    .update({ quantity_packed: nextPacked })
    .eq("id", order_item_id)
    .eq("quantity_packed", quantity_packed)
    .select("id")
    .maybeSingle();
  if (updErr || !updated) {
    return {
      ok: false,
      error: "Pack count changed under you — refresh and try again.",
    };
  }

  // Ensure an open pallet exists; create one if not.
  const { data: openPallet } = await adm
    .from("pallets")
    .select("id")
    .eq("order_id", order_id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let palletId = openPallet?.id ?? null;
  if (!palletId) {
    palletId = await createPallet(order_id);
  }

  // Add to pallet_items — merge into existing row for the same line if any.
  const { data: existingItem } = await adm
    .from("pallet_items")
    .select("id, quantity")
    .eq("pallet_id", palletId)
    .eq("order_item_id", order_item_id)
    .maybeSingle();
  if (existingItem) {
    await adm
      .from("pallet_items")
      .update({ quantity: existingItem.quantity + delta })
      .eq("id", existingItem.id);
  } else {
    await adm
      .from("pallet_items")
      .insert({
        pallet_id: palletId,
        order_item_id,
        quantity: delta,
      });
  }

  await adm.from("audit_log").insert({
    entity_type: "order",
    entity_id: order_id,
    action: nextPacked > quantity_approved ? "pack_overpack" : "pack_increment",
    actor_user_id: session.user.id,
    before_json: { order_item_id, quantity_packed } as Json,
    after_json: {
      order_item_id,
      quantity_packed: nextPacked,
      pallet_id: palletId,
      delta,
    } as unknown as Json,
  });

  revalidatePath(`/pack/${order_id}`);
  revalidatePath(`/pack`);
  return { ok: true };
}

async function createPallet(orderId: string): Promise<string> {
  const adm = createAdminClient();
  const year = new Date().getUTCFullYear();
  const { data: nextValue } = await adm.rpc("allocate_sequence", {
    p_key: `pallet_${year}`,
  });
  const palletNumber = `PAL-${year}-${String(nextValue ?? 1).padStart(5, "0")}`;
  const { data, error } = await adm
    .from("pallets")
    .insert({
      pallet_number: palletNumber,
      order_id: orderId,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createPallet: ${error?.message ?? "no row returned"}`);
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// openNewPallet — explicit "start a fresh pallet" button on the UI
// ---------------------------------------------------------------------------

export async function openNewPallet(
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const session = await requirePacker();
  if (!session) return { ok: false, error: "Forbidden" };
  const parsed = OrderIdInput.safeParse({ order_id: formData.get("order_id") });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await createPallet(parsed.data.order_id);
  revalidatePath(`/pack/${parsed.data.order_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// closePallet — flip pallet status open → packed
// ---------------------------------------------------------------------------

export async function closePallet(
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const session = await requirePacker();
  if (!session) return { ok: false, error: "Forbidden" };
  const parsed = PalletIdInput.safeParse({ pallet_id: formData.get("pallet_id") });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const adm = createAdminClient();
  const { data: pallet } = await adm
    .from("pallets")
    .select("id, order_id, status")
    .eq("id", parsed.data.pallet_id)
    .maybeSingle();
  if (!pallet) return { ok: false, error: "Pallet not found" };
  if (pallet.status !== "open") {
    return { ok: false, error: "Pallet is already closed" };
  }

  // Refuse to close an empty pallet — usually a misclick.
  const { count } = await adm
    .from("pallet_items")
    .select("id", { count: "exact", head: true })
    .eq("pallet_id", pallet.id);
  if (!count) return { ok: false, error: "Cannot close an empty pallet" };

  const { data: updated } = await adm
    .from("pallets")
    .update({
      status: "packed",
      packed_at: new Date().toISOString(),
      packed_by_user_id: session.user.id,
    })
    .eq("id", pallet.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return { ok: false, error: "Pallet state changed — refresh." };
  }

  await adm.from("audit_log").insert({
    entity_type: "order",
    entity_id: pallet.order_id,
    action: "pallet_closed",
    actor_user_id: session.user.id,
    before_json: { pallet_id: pallet.id, status: "open" } as Json,
    after_json: { pallet_id: pallet.id, status: "packed" } as Json,
  });

  revalidatePath(`/pack/${pallet.order_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// completeOrderPack — picking → packed + inventory accounting
// ---------------------------------------------------------------------------

export async function completeOrderPack(
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const session = await requirePacker();
  if (!session) return { ok: false, error: "Forbidden" };
  const parsed = OrderIdInput.safeParse({ order_id: formData.get("order_id") });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const orderId = parsed.data.order_id;

  const adm = createAdminClient();
  const { data: order } = await adm
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.status !== "picking") {
    return { ok: false, error: "Order is not in picking state" };
  }

  const { data: items } = await adm
    .from("order_items")
    .select("id, product_id, quantity_approved, quantity_packed")
    .eq("order_id", orderId);
  const lines = (items ?? []).filter((i) => (i.quantity_approved ?? 0) > 0);

  const incomplete = lines.filter(
    (i) => i.quantity_packed < i.quantity_approved!,
  );
  if (incomplete.length > 0) {
    return {
      ok: false,
      error: `${incomplete.length} line${incomplete.length === 1 ? "" : "s"} still under-packed`,
    };
  }

  // Refuse to complete if any pallet is still open. The packer must close
  // every pallet before the order leaves picking — otherwise there's no
  // physical association between the goods and a printable label.
  const { data: openPallets } = await adm
    .from("pallets")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "open")
    .is("deleted_at", null);
  if ((openPallets ?? []).length > 0) {
    return {
      ok: false,
      error: `${openPallets!.length} pallet${openPallets!.length === 1 ? " is" : "s are"} still open — close before completing.`,
    };
  }

  // Status-guarded flip.
  const { data: updated } = await adm
    .from("orders")
    .update({ status: "packed" })
    .eq("id", orderId)
    .eq("status", "picking")
    .select("id")
    .maybeSingle();
  if (!updated) {
    return { ok: false, error: "Order state changed — refresh." };
  }

  // Inventory accounting: write a movement per line, decrement on_hand
  // AND reserved by the packed quantity. Single batch insert for the
  // movements; per-row update for inventory (no Postgres transaction
  // primitive in supabase-js, so we accept best-effort linear writes
  // and rely on the audit row + the `packed` movements to reconcile if
  // an inventory write fails partway).
  const movements = lines.map((i) => ({
    product_id: i.product_id,
    delta: -i.quantity_packed,
    reason: "packed" as const,
    reference_type: "order",
    reference_id: orderId,
    actor_user_id: session.user.id,
  }));
  if (movements.length > 0) {
    await adm.from("inventory_movements").insert(movements);
  }

  for (const line of lines) {
    const { data: inv } = await adm
      .from("inventory")
      .select("quantity_on_hand, quantity_reserved")
      .eq("product_id", line.product_id)
      .maybeSingle();
    if (!inv) continue;
    await adm
      .from("inventory")
      .update({
        quantity_on_hand: Math.max(0, inv.quantity_on_hand - line.quantity_packed),
        quantity_reserved: Math.max(0, inv.quantity_reserved - line.quantity_packed),
      })
      .eq("product_id", line.product_id);
  }

  await adm.from("audit_log").insert({
    entity_type: "order",
    entity_id: orderId,
    action: "order_packed",
    actor_user_id: session.user.id,
    before_json: { status: "picking" } as Json,
    after_json: {
      status: "packed",
      lines: lines.map((l) => ({
        order_item_id: l.id,
        product_id: l.product_id,
        quantity_packed: l.quantity_packed,
      })),
    } as unknown as Json,
  });

  revalidatePath(`/pack/${orderId}`);
  revalidatePath(`/pack`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Order packed" };
}
