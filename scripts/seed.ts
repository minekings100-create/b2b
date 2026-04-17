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
