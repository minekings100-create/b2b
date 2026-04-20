"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  BranchCreateInput,
  BranchUpdateInput,
} from "@/lib/validation/branch-lifecycle";
import type { Json } from "@/lib/supabase/types";

/**
 * Post-MVP Sprint 1 — branch create + update.
 *
 * Archive / restore already live in `src/lib/actions/branches.ts`
 * (Phase 7b-2b). This module adds create + update for admins.
 *
 * Write path goes through the admin client for the same reason as
 * 7b-2b's archive/restore — RLS on `branches` is tight about
 * cross-branch mutations by non-super_admin branch_managers and the
 * admin-layer gate is the security boundary here.
 */

export type BranchFormState =
  | { error: string; fieldErrors?: Record<string, string> }
  | { success: true; id: string }
  | undefined;

function fieldErrors(
  issues: readonly { path: ReadonlyArray<PropertyKey>; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const iss of issues) {
    const key = iss.path.map(String).join(".");
    if (key && !out[key]) out[key] = iss.message;
  }
  return out;
}

export async function createBranch(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = BranchCreateInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const adm = createAdminClient();
  const { data: inserted, error } = await adm
    .from("branches")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: `Branch code "${parsed.data.branch_code}" already exists`,
        fieldErrors: { branch_code: "Must be unique" },
      };
    }
    return { error: error.message };
  }

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "branch",
    entity_id: inserted.id,
    action: "branch_created",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: parsed.data as unknown as Json,
  });

  revalidatePath("/branches");
  redirect(`/branches/${inserted.id}`);
}

export async function updateBranch(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = BranchUpdateInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const adm = createAdminClient();
  const { data: prior } = await adm
    .from("branches")
    .select(
      "name, branch_code, email, phone, visiting_address, billing_address, shipping_address, kvk_number, vat_number, iban, monthly_budget_cents, payment_term_days",
    )
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Branch not found" };

  const { id, ...patch } = parsed.data;
  const { error } = await adm.from("branches").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        error: `Branch code "${patch.branch_code}" already exists`,
        fieldErrors: { branch_code: "Must be unique" },
      };
    }
    return { error: error.message };
  }

  const supabase = createClient();
  await supabase.from("audit_log").insert({
    entity_type: "branch",
    entity_id: id,
    action: "branch_updated",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: patch as unknown as Json,
  });

  revalidatePath("/branches");
  revalidatePath(`/branches/${id}`);
  return { success: true, id };
}
