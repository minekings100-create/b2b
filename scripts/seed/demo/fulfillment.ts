import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SeededOrder } from "./orders";
import { daysBefore, pad, pickOne, seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;

export type SeededPallet = {
  id: string;
  pallet_number: string;
  order_id: string;
  order_number: string;
  packed_by_user_id: string | null;
  status: "packed" | "shipped" | "delivered";
  weight_kg: number | null;
};

export type SeededShipment = {
  id: string;
  order_id: string;
  order_number: string;
  carrier: string;
  tracking_number: string | null;
  shipped_at: string;
  delivered_at: string | null;
  pallet_ids: string[];
};

type UserLite = { id: string; email: string };

/**
 * Pallets exist for orders in `packed` / `shipped` / `delivered` / `closed`.
 * Small orders get 1 pallet. Larger orders split 2–3. Each pallet grabs a
 * contiguous slice of the order's line items.
 */
export async function seedPallets(
  supabase: AdminClient,
  orders: SeededOrder[],
  packers: UserLite[],
  now: Date,
): Promise<SeededPallet[]> {
  console.log("→ seeding pallets + pallet_items");
  const rand = seedRand(23);

  const needsPallet = orders.filter((o) =>
    ["packed", "shipped", "delivered", "closed"].includes(o.status),
  );

  const carrierChoices = ["PostNL", "DHL", "Eigen vervoer"] as const;
  let palletCounter = 1;
  const palletInserts: Array<{
    pallet_number: string;
    order_id: string;
    packed_by_user_id: string | null;
    packed_at: string;
    status: "packed" | "shipped" | "delivered";
    weight_kg: number | null;
    notes: string | null;
  }> = [];
  // Remember the per-pallet item slice so we can build pallet_items after
  // inserting pallet headers.
  type PlannedPallet = {
    pallet_number: string;
    order: SeededOrder;
    status: "packed" | "shipped" | "delivered";
    itemsSlice: SeededOrder["items"];
  };
  const planned: PlannedPallet[] = [];

  for (const order of needsPallet) {
    const totalItems = order.items.length;
    const palletCount =
      totalItems <= 5 ? 1 : totalItems <= 14 ? 1 + (rand() > 0.5 ? 1 : 0) : 2 + (rand() > 0.4 ? 1 : 0);
    const chunkSize = Math.ceil(totalItems / palletCount);
    const palletStatus: "packed" | "shipped" | "delivered" =
      order.status === "packed" ? "packed" : order.status === "delivered" || order.status === "closed" ? "delivered" : "shipped";

    for (let i = 0; i < palletCount; i++) {
      const slice = order.items.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length === 0) continue;
      // ~70% have weight_kg filled — exercise the "null weight" UI path too.
      const weight = rand() > 0.3 ? Math.round((15 + rand() * 380) * 10) / 10 : null;
      const packedBy = packers.length > 0 ? pickOne(rand, packers).id : null;
      // Pallets are packed right around when the order was packed.
      const packedDaysAgo = Math.max(
        1,
        (order.approved_at ? daysSince(order.approved_at, now) : 10) - Math.floor(rand() * 3),
      );
      const palletNumber = `DEMO-PAL-${pad(palletCounter, 4)}`;
      palletCounter += 1;

      palletInserts.push({
        pallet_number: palletNumber,
        order_id: order.id,
        packed_by_user_id: packedBy,
        packed_at: daysBefore(now, packedDaysAgo),
        status: palletStatus,
        weight_kg: weight,
        notes: i === 0 ? null : "Split across multiple pallets.",
      });
      planned.push({
        pallet_number: palletNumber,
        order,
        status: palletStatus,
        itemsSlice: slice,
      });
    }
  }

  if (palletInserts.length === 0) {
    console.log("  no pallets to insert");
    return [];
  }

  const { data: insertedPallets, error } = await supabase
    .from("pallets")
    .insert(palletInserts)
    .select("id, pallet_number, order_id, packed_by_user_id, status, weight_kg");
  if (error) throw error;
  const palletByNumber = new Map(
    (insertedPallets ?? []).map((p) => [p.pallet_number, p]),
  );

  // pallet_items — one row per (pallet, order_item) with quantity = the
  // order_item's quantity_packed (so we don't over-pack beyond approval).
  const palletItemInserts: Array<{
    pallet_id: string;
    order_item_id: string;
    quantity: number;
  }> = [];
  for (const plan of planned) {
    const palletId = palletByNumber.get(plan.pallet_number)!.id;
    for (const item of plan.itemsSlice) {
      const qty = item.quantity_packed > 0 ? item.quantity_packed : item.quantity_approved ?? item.quantity_requested;
      palletItemInserts.push({
        pallet_id: palletId,
        order_item_id: item.id,
        quantity: qty,
      });
    }
  }

  for (let i = 0; i < palletItemInserts.length; i += 200) {
    const chunk = palletItemInserts.slice(i, i + 200);
    const { error: piErr } = await supabase.from("pallet_items").insert(chunk);
    if (piErr) throw piErr;
  }

  const out: SeededPallet[] = (insertedPallets ?? []).map((p) => ({
    id: p.id,
    pallet_number: p.pallet_number,
    order_id: p.order_id,
    order_number:
      planned.find((pp) => pp.pallet_number === p.pallet_number)?.order.order_number ?? "",
    packed_by_user_id: p.packed_by_user_id,
    status: p.status as "packed" | "shipped" | "delivered",
    weight_kg: p.weight_kg,
  }));
  console.log(`  inserted ${out.length} pallets (${palletItemInserts.length} pallet_items)`);
  return out;
}

/**
 * Shipments exist for orders in `shipped` / `delivered` / `closed`. Each
 * shipment carries all pallets of its order.
 */
export async function seedShipments(
  supabase: AdminClient,
  orders: SeededOrder[],
  pallets: SeededPallet[],
  now: Date,
): Promise<SeededShipment[]> {
  console.log("→ seeding shipments + shipment_pallets");
  const rand = seedRand(31);
  const needsShipment = orders.filter((o) =>
    ["shipped", "delivered", "closed"].includes(o.status),
  );

  const carriers = ["PostNL", "DHL", "Eigen vervoer"] as const;
  const trackingFor = (carrier: string, idx: number): string | null => {
    if (carrier === "Eigen vervoer") return null;
    const n = pad(1000000 + idx * 137, 8);
    return carrier === "PostNL" ? `3SPNL${n}NL` : `DHL${n}`;
  };

  const shipmentInserts: Array<{
    order_id: string;
    carrier: string;
    tracking_number: string | null;
    shipped_at: string;
    delivered_at: string | null;
  }> = [];
  const shipmentPlans: Array<{ order_id: string; pallet_ids: string[] }> = [];
  let idx = 0;

  for (const order of needsShipment) {
    const orderPallets = pallets.filter((p) => p.order_id === order.id);
    if (orderPallets.length === 0) continue;
    const carrier = carriers[idx % carriers.length]!;
    idx += 1;
    const shippedDaysAgo = Math.max(1, Math.floor(rand() * 10));
    const deliveredAt =
      order.status === "delivered" || order.status === "closed"
        ? daysBefore(now, Math.max(0, shippedDaysAgo - (1 + Math.floor(rand() * 3))))
        : null;
    shipmentInserts.push({
      order_id: order.id,
      carrier,
      tracking_number: trackingFor(carrier, idx),
      shipped_at: daysBefore(now, shippedDaysAgo),
      delivered_at: deliveredAt,
    });
    shipmentPlans.push({
      order_id: order.id,
      pallet_ids: orderPallets.map((p) => p.id),
    });
  }

  if (shipmentInserts.length === 0) {
    console.log("  no shipments to insert");
    return [];
  }

  const { data: insertedShipments, error } = await supabase
    .from("shipments")
    .insert(shipmentInserts)
    .select("id, order_id, carrier, tracking_number, shipped_at, delivered_at");
  if (error) throw error;

  // Map back to the pallet plans and build shipment_pallets.
  const shipmentByOrder = new Map(
    (insertedShipments ?? []).map((s) => [s.order_id, s]),
  );
  const junctionInserts: Array<{ shipment_id: string; pallet_id: string }> = [];
  for (const plan of shipmentPlans) {
    const shipment = shipmentByOrder.get(plan.order_id);
    if (!shipment) continue;
    for (const palletId of plan.pallet_ids) {
      junctionInserts.push({ shipment_id: shipment.id, pallet_id: palletId });
    }
  }

  if (junctionInserts.length > 0) {
    const { error: jErr } = await supabase
      .from("shipment_pallets")
      .insert(junctionInserts);
    if (jErr) throw jErr;
  }

  const out: SeededShipment[] = (insertedShipments ?? []).map((s) => ({
    id: s.id,
    order_id: s.order_id,
    order_number: orders.find((o) => o.id === s.order_id)?.order_number ?? "",
    carrier: s.carrier,
    tracking_number: s.tracking_number,
    shipped_at: s.shipped_at!,
    delivered_at: s.delivered_at,
    pallet_ids: shipmentPlans.find((p) => p.order_id === s.order_id)?.pallet_ids ?? [],
  }));
  console.log(`  inserted ${out.length} shipments (${junctionInserts.length} shipment_pallets)`);
  return out;
}

function daysSince(iso: string, now: Date): number {
  const d = new Date(iso);
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}
