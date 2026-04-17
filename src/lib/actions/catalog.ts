"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  ProductArchiveInput,
  ProductCreateInput,
  ProductUpdateInput,
} from "@/lib/validation/product";
import type { Json } from "@/lib/supabase/types";

export type FormState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true; id: string }
  | undefined;

/**
 * Create a product. Admin (super_admin / administration) only. Writes an
 * `audit_log` row in the same request. On success, redirects to
 * `/catalog?pid=<new-id>` so the detail drawer opens on the new SKU.
 */
export async function createProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const raw = Object.fromEntries(formData.entries());
  const parsed = ProductCreateInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldErrors: Record<string, string> = {};
    for (const iss of parsed.error.issues) {
      const key = iss.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
    }
    return { error: issue?.message ?? "Invalid input", fieldErrors };
  }

  const supabase = createClient();
  const insertRow = { ...parsed.data, active: true };
  const { data, error } = await supabase
    .from("products")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: `SKU "${parsed.data.sku}" already exists`,
        fieldErrors: { sku: "SKU must be unique" },
      };
    }
    return { error: error.message };
  }

  await writeAudit({
    entity_type: "product",
    entity_id: data.id,
    action: "create",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: parsed.data as unknown as Json,
  });

  revalidatePath("/catalog");
  redirect(`/catalog?pid=${data.id}`);
}

/**
 * Update a product. Snapshots the current row into `before_json` so the
 * audit trail captures what changed.
 */
export async function updateProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const raw = Object.fromEntries(formData.entries());
  const parsed = ProductUpdateInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldErrors: Record<string, string> = {};
    for (const iss of parsed.error.issues) {
      const key = iss.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
    }
    return { error: issue?.message ?? "Invalid input", fieldErrors };
  }

  const supabase = createClient();

  // Snapshot the prior row for the audit trail.
  const { data: prior } = await supabase
    .from("products")
    .select(
      "sku, name, description, category_id, unit, unit_price_cents, vat_rate, min_order_qty, max_order_qty",
    )
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();

  const { id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    if (error.code === "23505") {
      return {
        error: `SKU "${parsed.data.sku}" already exists`,
        fieldErrors: { sku: "SKU must be unique" },
      };
    }
    return { error: error.message };
  }

  await writeAudit({
    entity_type: "product",
    entity_id: id,
    action: "update",
    actor_user_id: session.user.id,
    before_json: (prior ?? null) as unknown as Json,
    after_json: patch as unknown as Json,
  });

  revalidatePath("/catalog");
  redirect(`/catalog?pid=${id}`);
}

/** Soft-delete a product (sets `deleted_at` and `active=false`). */
export async function archiveProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = ProductArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();

  const { data: prior } = await supabase
    .from("products")
    .select("sku, name, active, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Product not found" };

  const { error } = await supabase
    .from("products")
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await writeAudit({
    entity_type: "product",
    entity_id: parsed.data.id,
    action: "archive",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { active: false, deleted_at: "<now>" } as Json,
  });

  revalidatePath("/catalog");
  redirect("/catalog");
}

async function writeAudit(row: {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  before_json: Json | null;
  after_json: Json | null;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("audit_log").insert(row);
  if (error) {
    // Don't crash the request — the mutation already committed. Log server
    // side so we can backfill if this ever happens.
    console.error("audit_log insert failed", {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      error: error.message,
    });
  }
}
