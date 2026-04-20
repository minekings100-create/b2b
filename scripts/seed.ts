/**
 * Phase 1 seed. Idempotent — safe to re-run. Uses the service-role client and
 * bypasses RLS. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * in .env.local (loaded via `tsx --env-file=.env.local`).
 */
import { createSeedClient } from "./seed/admin-client";
import { BRANCHES } from "./seed/branches";
import { USERS } from "./seed/users";
import { CATEGORIES } from "./seed/product-categories";
import { generateProducts } from "./seed/products";

async function main() {
  const supabase = createSeedClient();

  console.log("→ seeding branches");
  const branchIds: Record<string, string> = {};
  for (const b of BRANCHES) {
    const { data, error } = await supabase
      .from("branches")
      .upsert(b, { onConflict: "branch_code" })
      .select("id, branch_code")
      .single();
    if (error) throw error;
    branchIds[data!.branch_code] = data!.id;
  }

  console.log("→ seeding categories");
  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const { data, error } = await supabase
      .from("product_categories")
      .upsert(c, { onConflict: "name" })
      .select("id, name")
      .single();
    if (error) throw error;
    categoryIds[data!.name] = data!.id;
  }

  console.log("→ seeding products (500)");
  const products = generateProducts(500).map((p) => ({
    sku: p.sku,
    name: p.name,
    description: p.description,
    category_id: categoryIds[p.category_name]!,
    unit: p.unit,
    unit_price_cents: p.unit_price_cents,
    vat_rate: p.vat_rate,
    min_order_qty: p.min_order_qty,
    max_order_qty: p.max_order_qty,
  }));
  const chunkSize = 100;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("products")
      .upsert(chunk, { onConflict: "sku" });
    if (error) throw error;
  }

  // Post-MVP Sprint 3 — two example variant groups so the catalog grid
  // demonstrates the new chip switcher out of the box. Stable UUIDs keep
  // the seed idempotent — re-running updates rather than inserts.
  console.log("→ seeding variant-group examples (2 groups, 5 members)");
  const SAMPLE_VARIANTS: Array<{
    sku: string;
    name: string;
    description: string;
    category_name: string;
    unit: string;
    unit_price_cents: number;
    vat_rate: number;
    min_order_qty: number;
    max_order_qty: number | null;
    variant_group_id: string;
    variant_label: string;
  }> = [
    {
      sku: "SKU-VAR-CLEAN-500",
      name: "All-purpose cleaner",
      description: "Neutral pH multi-surface cleaner. 500ml spray bottle.",
      category_name: "Cleaning supplies",
      unit: "piece",
      unit_price_cents: 395,
      vat_rate: 21,
      min_order_qty: 1,
      max_order_qty: null,
      variant_group_id: "11111111-1111-4111-8111-111111111111",
      variant_label: "500ml",
    },
    {
      sku: "SKU-VAR-CLEAN-1000",
      name: "All-purpose cleaner",
      description: "Neutral pH multi-surface cleaner. 1L refill bottle.",
      category_name: "Cleaning supplies",
      unit: "piece",
      unit_price_cents: 695,
      vat_rate: 21,
      min_order_qty: 1,
      max_order_qty: null,
      variant_group_id: "11111111-1111-4111-8111-111111111111",
      variant_label: "1L",
    },
    {
      sku: "SKU-VAR-CLEAN-5000",
      name: "All-purpose cleaner",
      description: "Neutral pH multi-surface cleaner. 5L jerrycan.",
      category_name: "Cleaning supplies",
      unit: "piece",
      unit_price_cents: 2495,
      vat_rate: 21,
      min_order_qty: 1,
      max_order_qty: null,
      variant_group_id: "11111111-1111-4111-8111-111111111111",
      variant_label: "5L",
    },
    {
      sku: "SKU-VAR-GLOVE-M",
      name: "Nitrile glove",
      description: "Powder-free nitrile glove, box of 100.",
      category_name: "Safety & PPE",
      unit: "box",
      unit_price_cents: 895,
      vat_rate: 21,
      min_order_qty: 1,
      max_order_qty: null,
      variant_group_id: "22222222-2222-4222-8222-222222222222",
      variant_label: "M",
    },
    {
      sku: "SKU-VAR-GLOVE-L",
      name: "Nitrile glove",
      description: "Powder-free nitrile glove, box of 100.",
      category_name: "Safety & PPE",
      unit: "box",
      unit_price_cents: 895,
      vat_rate: 21,
      min_order_qty: 1,
      max_order_qty: null,
      variant_group_id: "22222222-2222-4222-8222-222222222222",
      variant_label: "L",
    },
  ];
  const variantRows = SAMPLE_VARIANTS.map((v) => ({
    sku: v.sku,
    name: v.name,
    description: v.description,
    category_id: categoryIds[v.category_name]!,
    unit: v.unit,
    unit_price_cents: v.unit_price_cents,
    vat_rate: v.vat_rate,
    min_order_qty: v.min_order_qty,
    max_order_qty: v.max_order_qty,
    variant_group_id: v.variant_group_id,
    variant_label: v.variant_label,
  }));
  {
    const { error } = await supabase
      .from("products")
      .upsert(variantRows, { onConflict: "sku" });
    if (error) throw error;
  }

  console.log("→ seeding users");
  // Single listUsers() call outside the loop — O(users) not O(users²).
  const existingRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (existingRes.error) throw existingRes.error;
  const existingByEmail = new Map(
    existingRes.data.users.map((u) => [u.email ?? "", u.id]),
  );

  for (const u of USERS) {
    let id = existingByEmail.get(u.email);
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) throw error;
      id = data.user.id;
      existingByEmail.set(u.email, id);
    }

    // Demo users pre-dismiss the welcome overlay so returning-dev
    // sessions and Playwright specs that don't care about onboarding
    // aren't surprised by it. Specs exercising the overlay reset this
    // column to null before their runs.
    await supabase
      .from("users")
      .update({ welcome_dismissed_at: new Date().toISOString() })
      .eq("id", id)
      .is("welcome_dismissed_at", null);

    // Role assignments: upsert can't target the partial unique index on
    // (user_id, role) WHERE branch_id IS NULL, so we query-then-insert.
    for (const a of u.assignments) {
      const branch_id = a.branch_code ? branchIds[a.branch_code]! : null;

      const existsQ = supabase
        .from("user_branch_roles")
        .select("id")
        .eq("user_id", id)
        .eq("role", a.role);
      const existsScoped =
        branch_id === null
          ? existsQ.is("branch_id", null)
          : existsQ.eq("branch_id", branch_id);
      const { data: rows, error: selErr } = await existsScoped.limit(1);
      if (selErr) throw selErr;

      if ((rows ?? []).length === 0) {
        const { error: insErr } = await supabase
          .from("user_branch_roles")
          .insert({ user_id: id, branch_id, role: a.role });
        if (insErr) throw insErr;
      }
    }
  }

  console.log("✓ seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
