/**
 * Demo seed — layers rich, representative data on top of Phase 1 seed so
 * every role-scoped screen has something to show during visual QA.
 *
 * Idempotent: every demo row is tagged (DEMO- number prefix, demo_ reference
 * prefix, or `_demo: true` in audit JSON) so re-running wipes and re-inserts
 * cleanly. Uses the service-role client and therefore bypasses RLS.
 *
 * Run:   npm run seed:demo
 */
import { createSeedClient } from "./seed/admin-client";
import { wipeDemoData } from "./seed/demo/wipe";
import { seedInventory, syncReservations } from "./seed/demo/inventory";
import { seedOrders } from "./seed/demo/orders";
import { seedPallets, seedShipments } from "./seed/demo/fulfillment";
import { seedInvoices } from "./seed/demo/billing";
import { seedReturns } from "./seed/demo/returns";
import { seedMovements } from "./seed/demo/movements";
import { seedAuditLog } from "./seed/demo/audit";

async function main() {
  const supabase = createSeedClient();
  const now = new Date();
  console.log(`=== demo seed (${now.toISOString()}) ===`);

  // 0. Wipe prior demo rows so re-runs are idempotent.
  await wipeDemoData(supabase);

  // 1. Inventory rows for every product (no-ops if already present).
  await seedInventory(supabase);

  // 2. Load role rosters (packers, administration) for actor attribution.
  const [{ data: users }, { data: roles }] = await Promise.all([
    supabase.from("users").select("id, email"),
    supabase.from("user_branch_roles").select("user_id, role"),
  ]);
  if (!users || !roles) {
    throw new Error("Missing users / roles — run Phase 1 seed first.");
  }
  const byId = new Map(users.map((u) => [u.id, u]));
  const packers = roles
    .filter((r) => r.role === "packer")
    .map((r) => byId.get(r.user_id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u.id, email: u.email }));
  const admins = roles
    .filter((r) => r.role === "administration" || r.role === "super_admin")
    .map((r) => byId.get(r.user_id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u.id, email: u.email }));

  // 3. Orders first — everything downstream depends on them.
  const orders = await seedOrders(supabase, now);

  // 4. Pallets for packed+ orders; shipments for shipped+ orders.
  const pallets = await seedPallets(supabase, orders, packers, now);
  await seedShipments(supabase, orders, pallets, now);

  // 5. Invoices (draft/issued/paid/overdue/cancelled) + payments.
  const invoices = await seedInvoices(supabase, orders, admins, now);

  // 6. Returns (requested/received/processed).
  const returns = await seedReturns(supabase, orders, now);

  // 7. Inventory movements from order + return state transitions.
  const reserved = await seedMovements(supabase, orders, returns, packers, admins, now);

  // 8. Sync reservation counts on inventory rows so the UI shows them.
  await syncReservations(supabase, reserved);

  // 9. Audit log entries for every state transition.
  await seedAuditLog(supabase, orders, invoices, returns, packers, admins, now);

  console.log("=== demo seed complete ===");
  const summary = {
    orders: orders.length,
    pallets: pallets.length,
    invoices: invoices.length,
    returns: returns.length,
    reservedProducts: reserved.size,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
