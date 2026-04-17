import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SeededOrder } from "./orders";
import type { SeededReturn } from "./returns";
import { daysBefore, pickOne, seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;
type UserLite = { id: string; email: string };

/**
 * Populate `inventory_movements` consistently with order states + returns.
 * Every row is tagged with `reference_type='demo_<kind>'` so the wipe step
 * can find and remove them.
 *
 * Returns the reserved quantity per product (for downstream `inventory.quantity_reserved`
 * sync).
 */
export async function seedMovements(
  supabase: AdminClient,
  orders: SeededOrder[],
  returns: SeededReturn[],
  packers: UserLite[],
  admins: UserLite[],
  now: Date,
): Promise<Map<string, number>> {
  console.log("→ seeding inventory_movements");
  const rand = seedRand(131);
  const rows: Array<{
    product_id: string;
    delta: number;
    reason: "order_reserved" | "order_released" | "packed" | "adjustment_in" | "adjustment_out" | "return_in";
    reference_type: string;
    reference_id: string | null;
    actor_user_id: string | null;
    created_at: string;
  }> = [];

  const reserved = new Map<string, number>();
  const addReserved = (productId: string, qty: number) => {
    reserved.set(productId, (reserved.get(productId) ?? 0) + qty);
  };

  for (const order of orders) {
    const actor = packers.length > 0 ? pickOne(rand, packers).id : null;

    // Reservations: approved + picking orders have live reservations.
    if (order.status === "approved" || order.status === "picking") {
      for (const it of order.items) {
        const qty = it.quantity_approved ?? it.quantity_requested;
        if (qty <= 0) continue;
        rows.push({
          product_id: it.product_id,
          delta: -qty,
          reason: "order_reserved",
          reference_type: "demo_order",
          reference_id: order.id,
          actor_user_id: order.approved_by_user_id ?? null,
          created_at: order.approved_at ?? order.created_at,
        });
        addReserved(it.product_id, qty);
      }
    }

    // Packed: inventory leaves the building (reservation released + packed).
    if (
      order.status === "packed" ||
      order.status === "shipped" ||
      order.status === "delivered" ||
      order.status === "closed"
    ) {
      for (const it of order.items) {
        const qty = it.quantity_packed > 0 ? it.quantity_packed : it.quantity_approved ?? it.quantity_requested;
        if (qty <= 0) continue;
        rows.push({
          product_id: it.product_id,
          delta: -qty,
          reason: "packed",
          reference_type: "demo_order",
          reference_id: order.id,
          actor_user_id: actor,
          created_at: daysBefore(now, 1 + Math.floor(rand() * 20)),
        });
      }
    }

    // Cancelled orders that were once approved release their reservation.
    if (order.status === "cancelled" && order.approved_at) {
      for (const it of order.items) {
        const qty = it.quantity_approved ?? it.quantity_requested;
        if (qty <= 0) continue;
        rows.push({
          product_id: it.product_id,
          delta: qty,
          reason: "order_released",
          reference_type: "demo_order",
          reference_id: order.id,
          actor_user_id: actor,
          created_at: daysBefore(now, 1 + Math.floor(rand() * 15)),
        });
      }
    }
  }

  // Returns — processed refunds restock to warehouse.
  for (const ret of returns) {
    if (ret.status !== "processed") continue;
    for (const it of ret.items) {
      if (it.resolution !== "refund" && it.resolution !== "credit_note") {
        // Replaces don't restock — the item is damaged/wrong.
        continue;
      }
      rows.push({
        product_id: it.product_id,
        delta: it.quantity,
        reason: "return_in",
        reference_type: "demo_return",
        reference_id: ret.id,
        actor_user_id: admins.length > 0 ? pickOne(rand, admins).id : null,
        created_at: daysBefore(now, 5 + Math.floor(rand() * 10)),
      });
    }
  }

  // A sprinkle of manual adjustments so the admin inventory view has
  // heterogeneous rows.
  const adjustmentSamples = 8;
  const { data: productSample, error: sampleErr } = await supabase
    .from("products")
    .select("id")
    .limit(200);
  if (sampleErr) throw sampleErr;
  for (let i = 0; i < adjustmentSamples; i++) {
    if (!productSample || productSample.length === 0) break;
    const p = pickOne(rand, productSample);
    const positive = rand() > 0.5;
    const qty = 5 + Math.floor(rand() * 40);
    rows.push({
      product_id: p.id,
      delta: positive ? qty : -qty,
      reason: positive ? "adjustment_in" : "adjustment_out",
      reference_type: "demo_adjustment",
      reference_id: null,
      actor_user_id: admins.length > 0 ? pickOne(rand, admins).id : null,
      created_at: daysBefore(now, 2 + Math.floor(rand() * 25)),
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("inventory_movements").insert(chunk);
    if (error) throw error;
  }

  console.log(`  inserted ${rows.length} inventory_movements`);
  return reserved;
}
