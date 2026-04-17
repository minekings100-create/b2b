import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type AdminClient = SupabaseClient<Database>;

/**
 * Delete every row the demo seed previously inserted. Runs in FK dependency
 * order. Safe to call before every seed run — this is how we stay idempotent
 * without ON CONFLICT upserts on compound keys.
 *
 * Demo identification strategy:
 *  - orders/pallets/invoices/returns → number/code prefixed `DEMO-`
 *  - audit_log → JSON payload carries `"_demo": true`
 *  - inventory_movements → `reference_type` prefixed `demo_`
 *  - inventory rows are kept; quantities are recomputed each run
 */
export async function wipeDemoData(supabase: AdminClient) {
  console.log("→ wiping prior demo data");

  // 1. audit_log — append-only, deleted via service role (bypasses RLS).
  {
    const { error } = await supabase
      .from("audit_log")
      .delete()
      .or("before_json->>_demo.eq.true,after_json->>_demo.eq.true");
    if (error) throw error;
  }

  // 2. Collect the demo order IDs once; reused by later steps.
  const { data: demoOrders, error: ordErr } = await supabase
    .from("orders")
    .select("id")
    .like("order_number", "DEMO-%");
  if (ordErr) throw ordErr;
  const demoOrderIds = (demoOrders ?? []).map((o) => o.id);

  const { data: demoPallets, error: palErr } = await supabase
    .from("pallets")
    .select("id")
    .like("pallet_number", "DEMO-%");
  if (palErr) throw palErr;
  const demoPalletIds = (demoPallets ?? []).map((p) => p.id);

  // 3. invoices + cascades (invoice_items, payments).
  {
    const { error } = await supabase
      .from("invoices")
      .delete()
      .like("invoice_number", "DEMO-%");
    if (error) throw error;
  }

  // 4. returns + cascades (return_items). Must run before orders delete
  //    because returns.order_id is ON DELETE RESTRICT.
  {
    const { error } = await supabase
      .from("returns")
      .delete()
      .like("rma_number", "DEMO-%");
    if (error) throw error;
  }

  // 5. inventory_movements — filter by our reference_type marker.
  {
    const { error } = await supabase
      .from("inventory_movements")
      .delete()
      .like("reference_type", "demo_%");
    if (error) throw error;
  }

  // 6. shipments — ON DELETE CASCADE from orders would handle this, but we
  //    must remove shipment_pallets that reference demo pallets with
  //    RESTRICT before we can delete pallets. Deleting shipments directly
  //    cascades shipment_pallets on shipment_id.
  if (demoOrderIds.length > 0) {
    const { error } = await supabase
      .from("shipments")
      .delete()
      .in("order_id", demoOrderIds);
    if (error) throw error;
  }

  // 7. Any leftover shipment_pallets that still reference demo pallets
  //    (e.g. shipments belonging to non-demo orders — shouldn't happen but
  //    keeps us defensive).
  if (demoPalletIds.length > 0) {
    const { error } = await supabase
      .from("shipment_pallets")
      .delete()
      .in("pallet_id", demoPalletIds);
    if (error) throw error;
  }

  // 8. pallets — cascades pallet_items. Must delete directly (not via orders
  //    cascade) because pallet_items.order_item_id is ON DELETE RESTRICT;
  //    removing pallets first lets the orders delete succeed.
  if (demoOrderIds.length > 0) {
    const { error } = await supabase
      .from("pallets")
      .delete()
      .in("order_id", demoOrderIds);
    if (error) throw error;
  }

  // 9. orders — cascades order_items.
  {
    const { error } = await supabase
      .from("orders")
      .delete()
      .like("order_number", "DEMO-%");
    if (error) throw error;
  }

  console.log("  cleared");
}
