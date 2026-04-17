"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  CsvProductRow,
  normaliseRawRow,
  type CsvProductRowT,
} from "@/lib/validation/csv-product";
import type { Json } from "@/lib/supabase/types";

export type PreviewRow =
  | {
      index: number;
      status: "new" | "update";
      sku: string;
      data: CsvProductRowT & { category_id: string | null };
    }
  | {
      index: number;
      status: "error";
      sku: string | null;
      errors: string[];
    };

export type PreviewResult = {
  rows: PreviewRow[];
  summary: { total: number; newCount: number; updateCount: number; errorCount: number };
};

export type CommitResult =
  | { success: true; inserted: number; updated: number }
  | { error: string; fieldErrors?: Record<number, string[]> };

/**
 * Validate raw rows against the CSV schema + the live DB. Returns a preview
 * with per-row status ({'new','update','error'}). Admin-only.
 */
export async function previewImport(
  rawRows: Record<string, unknown>[],
): Promise<PreviewResult | { error: string }> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const { rows } = await validateRows(rawRows);
  const newCount = rows.filter((r) => r.status === "new").length;
  const updateCount = rows.filter((r) => r.status === "update").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  return {
    rows,
    summary: { total: rows.length, newCount, updateCount, errorCount },
  };
}

/**
 * Actually perform the upsert. Re-validates at the trust boundary — never
 * trust client-sent data even if we already validated during preview.
 */
export async function commitImport(
  rawRows: Record<string, unknown>[],
): Promise<CommitResult> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const { rows } = await validateRows(rawRows);
  const errorRows = rows.filter((r) => r.status === "error");
  if (errorRows.length > 0) {
    const fieldErrors: Record<number, string[]> = {};
    for (const r of errorRows) {
      if (r.status === "error") fieldErrors[r.index] = r.errors;
    }
    return {
      error: `${errorRows.length} row${errorRows.length === 1 ? "" : "s"} have errors`,
      fieldErrors,
    };
  }

  const supabase = createClient();
  const validRows = rows.filter(
    (r): r is Extract<PreviewRow, { status: "new" | "update" }> =>
      r.status === "new" || r.status === "update",
  );
  if (validRows.length === 0) return { success: true, inserted: 0, updated: 0 };

  // Upsert on sku. `onConflict: "sku"` maps to ON CONFLICT (sku) and is atomic.
  const upsertPayload = validRows.map((r) => ({
    sku: r.data.sku,
    name: r.data.name,
    description: r.data.description,
    category_id: r.data.category_id,
    unit: r.data.unit,
    unit_price_cents: r.data.unit_price_cents,
    vat_rate: r.data.vat_rate,
    min_order_qty: r.data.min_order_qty,
    max_order_qty: r.data.max_order_qty,
    active: true,
  }));

  const { data: upserted, error: upsertErr } = await supabase
    .from("products")
    .upsert(upsertPayload, { onConflict: "sku" })
    .select("id, sku");
  if (upsertErr) return { error: upsertErr.message };

  const idBySku = new Map(
    (upserted ?? []).map((row) => [row.sku, row.id] as const),
  );

  // Seed inventory rows for the *new* SKUs so later reads/adjusts have a row
  // to join against. Ignored if inventory already exists.
  const newInventoryRows = validRows
    .filter((r) => r.status === "new" && idBySku.has(r.data.sku))
    .map((r) => ({
      product_id: idBySku.get(r.data.sku)!,
      quantity_on_hand: 0,
      quantity_reserved: 0,
      reorder_level: 0,
    }));
  if (newInventoryRows.length > 0) {
    const { error: invErr } = await supabase
      .from("inventory")
      .upsert(newInventoryRows, { onConflict: "product_id" });
    if (invErr) console.error("inventory seed (import) failed", invErr);
  }

  // Audit-log per row.
  const auditRows = validRows
    .filter((r) => idBySku.has(r.data.sku))
    .map((r) => ({
      entity_type: "product",
      entity_id: idBySku.get(r.data.sku)!,
      action: r.status === "new" ? "create" : "update",
      actor_user_id: session.user.id,
      before_json: null,
      after_json: { ...r.data, source: "csv_import" } as unknown as Json,
    }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await supabase.from("audit_log").insert(auditRows);
    if (auditErr) console.error("audit_log (import) failed", auditErr);
  }

  revalidatePath("/catalog");

  const inserted = validRows.filter((r) => r.status === "new").length;
  const updated = validRows.filter((r) => r.status === "update").length;
  return { success: true, inserted, updated };
}

/**
 * Shared validation: runs Zod per row, resolves category_name → category_id
 * against the DB, marks each row as new or update or error.
 */
async function validateRows(
  rawRows: Record<string, unknown>[],
): Promise<{ rows: PreviewRow[] }> {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { rows: [] };
  }

  const supabase = createClient();

  // Collect needed look-ups up front: all categories + any SKUs already
  // present (to classify new vs update).
  const [{ data: categories }, { data: existingProducts }] = await Promise.all([
    supabase.from("product_categories").select("id, name").is("deleted_at", null),
    supabase
      .from("products")
      .select("sku")
      .in(
        "sku",
        rawRows
          .map((r) => String(r.sku ?? "").trim())
          .filter((s) => s.length > 0),
      )
      .is("deleted_at", null),
  ]);
  const categoryByName = new Map(
    (categories ?? []).map((c) => [c.name.toLowerCase(), c.id] as const),
  );
  const existingSkus = new Set(
    (existingProducts ?? []).map((p) => p.sku.toLowerCase()),
  );

  const seenInFile = new Set<string>();
  const rows: PreviewRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = normaliseRawRow(rawRows[i] ?? {});
    const parsed = CsvProductRow.safeParse(raw);
    const skuFromRaw = typeof raw.sku === "string" ? raw.sku.trim() : null;

    if (!parsed.success) {
      rows.push({
        index: i,
        status: "error",
        sku: skuFromRaw,
        errors: parsed.error.issues.map(
          (iss) => `${iss.path.join(".") || "row"}: ${iss.message}`,
        ),
      });
      continue;
    }

    const row = parsed.data;
    const skuLc = row.sku.toLowerCase();

    // Duplicate SKUs within the same file.
    if (seenInFile.has(skuLc)) {
      rows.push({
        index: i,
        status: "error",
        sku: row.sku,
        errors: [`Duplicate SKU in file: "${row.sku}"`],
      });
      continue;
    }
    seenInFile.add(skuLc);

    // Resolve category name → id.
    let category_id: string | null = null;
    if (row.category_name) {
      const resolved = categoryByName.get(row.category_name.toLowerCase());
      if (!resolved) {
        rows.push({
          index: i,
          status: "error",
          sku: row.sku,
          errors: [`Unknown category "${row.category_name}"`],
        });
        continue;
      }
      category_id = resolved;
    }

    rows.push({
      index: i,
      status: existingSkus.has(skuLc) ? "update" : "new",
      sku: row.sku,
      data: { ...row, category_id },
    });
  }

  return { rows };
}
