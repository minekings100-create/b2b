"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  CategoryArchiveInput,
  CategoryCreateInput,
  CategoryUpdateInput,
} from "@/lib/validation/category";
import type { Json } from "@/lib/supabase/types";

export type CategoryFormState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true; id?: string }
  | undefined;

function collectFieldErrors(
  issues: readonly { path: ReadonlyArray<PropertyKey>; message: string }[],
) {
  const fieldErrors: Record<string, string> = {};
  for (const iss of issues) {
    const key = iss.path.map(String).join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
  }
  return fieldErrors;
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = CategoryCreateInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_categories")
    .insert(parsed.data)
    .select("id, name")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: `Category "${parsed.data.name}" already exists`,
        fieldErrors: { name: "Must be unique" },
      };
    }
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "product_category",
    entity_id: data.id,
    action: "create",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: parsed.data as unknown as Json,
  });

  revalidatePath("/catalog");
  revalidatePath("/catalog/categories");
  return { success: true, id: data.id };
}

export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = CategoryUpdateInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = createClient();
  const { data: prior } = await supabase
    .from("product_categories")
    .select("name, sort_order")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { error: "Category not found" };

  const { id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("product_categories")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    if (error.code === "23505") {
      return {
        error: `Category "${parsed.data.name}" already exists`,
        fieldErrors: { name: "Must be unique" },
      };
    }
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "product_category",
    entity_id: id,
    action: "update",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: patch as unknown as Json,
  });

  revalidatePath("/catalog");
  revalidatePath("/catalog/categories");
  return { success: true, id };
}

export async function archiveCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = CategoryArchiveInput.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const { data: prior } = await supabase
    .from("product_categories")
    .select("name, sort_order, deleted_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Category not found" };

  const { error } = await supabase
    .from("product_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "product_category",
    entity_id: parsed.data.id,
    action: "archive",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: { deleted_at: "<now>" } as Json,
  });

  revalidatePath("/catalog");
  revalidatePath("/catalog/categories");
  return { success: true, id: parsed.data.id };
}
