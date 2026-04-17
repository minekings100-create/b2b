/**
 * One-off cleanup: purge any products with SKU prefixed `E2E-` that leaked
 * from a failing Playwright run. Safe to re-run. Uses the service-role
 * client — bypasses RLS.
 *
 * Run with: `npm run cleanup:e2e`
 */
import { createSeedClient } from "./seed/admin-client";

async function main() {
  const s = createSeedClient();

  const { data: victims, error: findErr } = await s
    .from("products")
    .select("id, sku, deleted_at")
    .like("sku", "E2E-%");
  if (findErr) throw findErr;
  if (!victims || victims.length === 0) {
    console.log("no E2E products found");
    return;
  }
  console.log(`found ${victims.length} E2E product(s):`);
  for (const v of victims) {
    console.log(`  ${v.sku} (id=${v.id}, deleted=${v.deleted_at ?? "null"})`);
  }

  // Delete audit_log rows for these entities — audit_log has no FK.
  const ids = victims.map((v) => v.id);
  const { error: auditErr } = await s
    .from("audit_log")
    .delete()
    .eq("entity_type", "product")
    .in("entity_id", ids);
  if (auditErr) throw auditErr;

  // Hard delete the products.
  const { error: delErr } = await s.from("products").delete().in("id", ids);
  if (delErr) throw delErr;

  console.log(`removed ${victims.length} product(s) + their audit_log rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
