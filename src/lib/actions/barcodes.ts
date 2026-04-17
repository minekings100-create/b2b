"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { BarcodeAddInput, BarcodeRemoveInput } from "@/lib/validation/barcode";
import type { Json } from "@/lib/supabase/types";

export type BarcodeFormState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true }
  | undefined;

export async function addBarcode(
  _prev: BarcodeFormState,
  formData: FormData,
): Promise<BarcodeFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const raw = Object.fromEntries(formData.entries());
  const parsed = BarcodeAddInput.safeParse(raw);
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
  const { data, error } = await supabase
    .from("product_barcodes")
    .insert({
      product_id: parsed.data.product_id,
      barcode: parsed.data.barcode,
      unit_multiplier: parsed.data.unit_multiplier,
    })
    .select("id, barcode")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: `Barcode "${parsed.data.barcode}" already exists`,
        fieldErrors: { barcode: "Must be unique" },
      };
    }
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "product_barcode",
    entity_id: data.id,
    action: "create",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: parsed.data as unknown as Json,
  });

  revalidatePath("/catalog");
  return { success: true };
}

export async function removeBarcode(
  _prev: BarcodeFormState,
  formData: FormData,
): Promise<BarcodeFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = BarcodeRemoveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();

  const { data: prior } = await supabase
    .from("product_barcodes")
    .select("product_id, barcode, unit_multiplier")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Barcode not found" };

  const { error } = await supabase
    .from("product_barcodes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "product_barcode",
    entity_id: parsed.data.id,
    action: "archive",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { deleted_at: "<now>" } as Json,
  });

  revalidatePath("/catalog");
  return { success: true };
}
