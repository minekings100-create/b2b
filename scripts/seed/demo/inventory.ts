import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;

/**
 * Ensure every product has an `inventory` row. Deterministic quantities so
 * re-running doesn't shuffle numbers under the UI. Warehouse locations cycle
 * through a small set so the "bin location" column has something to render.
 */
export async function seedInventory(supabase: AdminClient) {
  console.log("→ seeding inventory rows");

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, sku")
    .order("sku");
  if (prodErr) throw prodErr;
  if (!products || products.length === 0) {
    throw new Error("No products found — run `npm run seed` (Phase 1) first.");
  }

  const { data: existing, error: invErr } = await supabase
    .from("inventory")
    .select("product_id");
  if (invErr) throw invErr;
  const have = new Set((existing ?? []).map((r) => r.product_id));

  const rand = seedRand(101);
  const bins = ["A-01", "A-02", "A-03", "B-11", "B-12", "C-21", "C-22", "D-31"];
  const rowsToInsert: Array<{
    product_id: string;
    quantity_on_hand: number;
    quantity_reserved: number;
    reorder_level: number;
    warehouse_location: string;
  }> = [];

  for (const p of products) {
    if (have.has(p.id)) continue;
    const onHand = 50 + Math.floor(rand() * 450);
    const reorder = 30 + Math.floor(rand() * 60);
    rowsToInsert.push({
      product_id: p.id,
      quantity_on_hand: onHand,
      quantity_reserved: 0,
      reorder_level: reorder,
      warehouse_location: bins[Math.floor(rand() * bins.length)]!,
    });
  }

  if (rowsToInsert.length === 0) {
    console.log("  all products already have inventory rows");
    return;
  }

  // Insert in chunks to stay well under Supabase payload limits.
  for (let i = 0; i < rowsToInsert.length; i += 200) {
    const chunk = rowsToInsert.slice(i, i + 200);
    const { error } = await supabase.from("inventory").insert(chunk);
    if (error) throw error;
  }
  console.log(`  inserted ${rowsToInsert.length} inventory rows`);
}

/**
 * After all orders + movements are seeded, re-sync `inventory.quantity_reserved`
 * so reservations on approved/picking orders are reflected. We recompute from
 * scratch rather than mutating during the seed to keep the flow linear.
 */
export async function syncReservations(
  supabase: AdminClient,
  reservedByProduct: Map<string, number>,
) {
  console.log("→ syncing inventory.quantity_reserved");
  // Zero everything first (cheap; 500 rows).
  const { error: zeroErr } = await supabase
    .from("inventory")
    .update({ quantity_reserved: 0 })
    .gte("quantity_reserved", 0);
  if (zeroErr) throw zeroErr;

  for (const [productId, qty] of reservedByProduct) {
    const { error } = await supabase
      .from("inventory")
      .update({ quantity_reserved: qty })
      .eq("product_id", productId);
    if (error) throw error;
  }
}
