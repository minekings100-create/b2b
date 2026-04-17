"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, hasAnyRole } from "@/lib/auth/roles";
import {
  InventoryAdjustInput,
  InventoryMetaInput,
} from "@/lib/validation/inventory";
import type { Json } from "@/lib/supabase/types";

export type InventoryFormState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true }
  | undefined;

/**
 * Adjust the `quantity_on_hand` of a product's inventory row. Creates the
 * inventory row if it doesn't exist. Writes an append-only
 * `inventory_movements` entry and an `audit_log` row. Admins + super_admin
 * only; packers also have RLS access per SPEC §5 but the UI only exposes
 * this to admins for now.
 */
export async function adjustInventory(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles) && !hasAnyRole(session.roles, ["packer"])) {
    return { error: "Forbidden" };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = InventoryAdjustInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const iss of parsed.error.issues) {
      const key = iss.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors,
    };
  }

  const { product_id, direction, amount, note } = parsed.data;
  const delta = direction === "in" ? amount : -amount;
  const reason = direction === "in" ? "adjustment_in" : "adjustment_out";

  const supabase = createClient();

  // Load (or create) the inventory row.
  const { data: existing, error: selErr } = await supabase
    .from("inventory")
    .select("id, quantity_on_hand, quantity_reserved, reorder_level, warehouse_location")
    .eq("product_id", product_id)
    .maybeSingle();
  if (selErr) return { error: selErr.message };

  const prior = existing ?? null;
  const priorOnHand = prior?.quantity_on_hand ?? 0;
  const nextOnHand = priorOnHand + delta;
  if (nextOnHand < 0) {
    return {
      error: `Not enough stock — current ${priorOnHand}, attempted −${amount}`,
      fieldErrors: { amount: "Would make on-hand negative" },
    };
  }

  if (prior) {
    const { error: updErr } = await supabase
      .from("inventory")
      .update({ quantity_on_hand: nextOnHand })
      .eq("id", prior.id);
    if (updErr) return { error: updErr.message };
  } else {
    const { error: insErr } = await supabase
      .from("inventory")
      .insert({ product_id, quantity_on_hand: nextOnHand });
    if (insErr) return { error: insErr.message };
  }

  const { error: movErr } = await supabase.from("inventory_movements").insert({
    product_id,
    delta,
    reason,
    reference_type: "manual_adjustment",
    reference_id: null,
    actor_user_id: session.user.id,
  });
  if (movErr) return { error: movErr.message };

  await supabase.from("audit_log").insert({
    entity_type: "inventory",
    entity_id: product_id,
    action: reason,
    actor_user_id: session.user.id,
    before_json: { quantity_on_hand: priorOnHand, note } as Json,
    after_json: { quantity_on_hand: nextOnHand, delta, note } as Json,
  });

  revalidatePath("/catalog");
  return { success: true };
}

/**
 * Update inventory metadata (reorder level + warehouse location). No
 * movement row — these don't change counts.
 */
export async function updateInventoryMeta(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles) && !hasAnyRole(session.roles, ["packer"])) {
    return { error: "Forbidden" };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = InventoryMetaInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const iss of parsed.error.issues) {
      const key = iss.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
    }
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors,
    };
  }

  const supabase = createClient();
  const { product_id, reorder_level, warehouse_location } = parsed.data;

  const { data: prior, error: priorErr } = await supabase
    .from("inventory")
    .select("id, reorder_level, warehouse_location")
    .eq("product_id", product_id)
    .maybeSingle();
  if (priorErr) return { error: priorErr.message };

  if (prior) {
    const { error } = await supabase
      .from("inventory")
      .update({ reorder_level, warehouse_location })
      .eq("id", prior.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("inventory").insert({
      product_id,
      reorder_level,
      warehouse_location,
    });
    if (error) return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "inventory",
    entity_id: product_id,
    action: "meta_update",
    actor_user_id: session.user.id,
    before_json: (prior ?? {}) as Json,
    after_json: { reorder_level, warehouse_location } as Json,
  });

  revalidatePath("/catalog");
  return { success: true };
}
