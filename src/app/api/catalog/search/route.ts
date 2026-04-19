import { NextResponse } from "next/server";

import { getUserWithRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/search?q=<text> — cheap catalog typeahead for the
 * Phase 3.4 order-edit "Add product" input. Returns up to 20 active
 * products whose SKU or name matches the query (case-insensitive).
 * Session-gated so anon traffic can't enumerate the catalog.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getUserWithRoles();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  const supabase = createClient();
  // `.or(...)` with ILIKE on two columns. Supabase's PostgREST accepts
  // the OR filter via a comma-joined expression.
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, name, unit_price_cents, vat_rate, min_order_qty, max_order_qty",
    )
    .eq("active", true)
    .is("deleted_at", null)
    .or(`sku.ilike.${pattern},name.ilike.${pattern}`)
    .order("sku", { ascending: true })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}
