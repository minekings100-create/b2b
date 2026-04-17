"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/auth/session";

const CatalogViewInput = z.object({
  view: z.enum(["table", "grid"]),
});

/**
 * Persist the caller's catalog view preference on `users.ui_catalog_view`.
 * Called from the Table/Grid toggle in the catalog header.
 */
export async function setCatalogView(
  view: "table" | "grid",
): Promise<{ error?: string }> {
  const session = await getUserWithRoles();
  if (!session) return { error: "Unauthenticated" };

  const parsed = CatalogViewInput.safeParse({ view });
  if (!parsed.success) return { error: "Invalid view" };

  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ ui_catalog_view: parsed.data.view })
    .eq("id", session.user.id);
  if (error) return { error: error.message };

  revalidatePath("/catalog");
  return {};
}
