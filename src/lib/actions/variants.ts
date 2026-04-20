"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import type { Json } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 3 — variant-group mutations.
 *
 * Two admin actions:
 *   - joinVariantGroup: attach a product to an existing group, or create a
 *     brand-new group by generating a fresh UUID server-side.
 *   - ungroupVariant: null out variant_group_id + variant_label on a single
 *     product (leaves siblings grouped — this is per-product, not a
 *     group-wide dissolve).
 *
 * Both redirect back to the admin drawer (`?eid=<id>`) and write an
 * audit_log row.
 */

export type VariantActionState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true }
  | undefined;

const JoinInput = z.object({
  product_id: z.string().uuid(),
  // Either an existing uuid, or the literal "new" meaning "create a fresh group".
  group_choice: z.union([z.string().uuid(), z.literal("new")]),
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(30, "Label ≤ 30 chars"),
});

const UngroupInput = z.object({
  product_id: z.string().uuid(),
});

export async function joinVariantGroup(
  _prev: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = JoinInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
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
  const group_id =
    parsed.data.group_choice === "new"
      ? crypto.randomUUID()
      : parsed.data.group_choice;

  // Snapshot prior for audit.
  const { data: prior } = await supabase
    .from("products")
    .select("variant_group_id, variant_label")
    .eq("id", parsed.data.product_id)
    .maybeSingle();

  const { error } = await supabase
    .from("products")
    .update({
      variant_group_id: group_id,
      variant_label: parsed.data.label,
    })
    .eq("id", parsed.data.product_id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await writeAudit({
    entity_type: "product",
    entity_id: parsed.data.product_id,
    action: "variant_group_join",
    actor_user_id: session.user.id,
    before_json: (prior ?? null) as unknown as Json,
    after_json: {
      variant_group_id: group_id,
      variant_label: parsed.data.label,
    } as Json,
  });

  revalidatePath("/catalog");
  redirect(`/catalog?eid=${parsed.data.product_id}`);
}

export async function ungroupVariant(
  _prev: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = UngroupInput.safeParse({
    product_id: formData.get("product_id"),
  });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const { data: prior } = await supabase
    .from("products")
    .select("variant_group_id, variant_label")
    .eq("id", parsed.data.product_id)
    .maybeSingle();
  if (!prior?.variant_group_id) {
    return { error: "Product is not in a variant group" };
  }

  const { error } = await supabase
    .from("products")
    .update({ variant_group_id: null, variant_label: null })
    .eq("id", parsed.data.product_id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await writeAudit({
    entity_type: "product",
    entity_id: parsed.data.product_id,
    action: "variant_group_leave",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { variant_group_id: null, variant_label: null } as Json,
  });

  revalidatePath("/catalog");
  redirect(`/catalog?eid=${parsed.data.product_id}`);
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
    console.error("audit_log insert failed", {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      error: error.message,
    });
  }
}
