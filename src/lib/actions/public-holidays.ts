"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/roles";
import {
  PublicHolidayCreateInput,
  PublicHolidayDeleteInput,
  PublicHolidayUpdateInput,
} from "@/lib/validation/public-holiday";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 7b-2a — public_holidays CRUD actions.
 *
 * Super_admin only; the RLS policy in migration 20260420000001 already
 * enforces this at the DB layer, but we check up front for a friendlier
 * error than PostgREST's default.
 *
 * Each mutation writes one `audit_log` row (`entity_type='public_holiday'`,
 * action=`holiday_created/holiday_updated/holiday_deleted`).
 */

export type HolidayFormState =
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

export async function createHoliday(
  _prev: HolidayFormState,
  formData: FormData,
): Promise<HolidayFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = PublicHolidayCreateInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("public_holidays")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: `A holiday for ${parsed.data.region} on ${parsed.data.date} already exists`,
        fieldErrors: { date: "Must be unique per region" },
      };
    }
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "public_holiday",
    entity_id: data.id,
    action: "holiday_created",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: parsed.data as unknown as Json,
  });

  revalidatePath("/admin/holidays");
  return { success: true, id: data.id };
}

export async function updateHoliday(
  _prev: HolidayFormState,
  formData: FormData,
): Promise<HolidayFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = PublicHolidayUpdateInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = createClient();
  const { data: prior } = await supabase
    .from("public_holidays")
    .select("region, date, name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Holiday not found" };

  const { id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("public_holidays")
    .update(patch)
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        error: `A holiday for ${patch.region} on ${patch.date} already exists`,
        fieldErrors: { date: "Must be unique per region" },
      };
    }
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    entity_type: "public_holiday",
    entity_id: id,
    action: "holiday_updated",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: patch as unknown as Json,
  });

  revalidatePath("/admin/holidays");
  return { success: true, id };
}

export async function deleteHoliday(
  _prev: HolidayFormState,
  formData: FormData,
): Promise<HolidayFormState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.roles)) return { error: "Forbidden" };

  const parsed = PublicHolidayDeleteInput.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();
  const { data: prior } = await supabase
    .from("public_holidays")
    .select("region, date, name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!prior) return { error: "Holiday not found" };

  const { error } = await supabase
    .from("public_holidays")
    .delete()
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    entity_type: "public_holiday",
    entity_id: parsed.data.id,
    action: "holiday_deleted",
    actor_user_id: session.user.id,
    before_json: prior as unknown as Json,
    after_json: null,
  });

  revalidatePath("/admin/holidays");
  return { success: true, id: parsed.data.id };
}
