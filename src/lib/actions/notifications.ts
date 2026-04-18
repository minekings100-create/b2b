"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark notifications as read. RLS already gates the update to the
 * caller's own rows (`notifications_update` policy in 20260417000011),
 * so we don't need to re-check the user_id at the application layer.
 *
 * Behaviour:
 *   - With `ids`: only those rows are touched. Used by the dropdown
 *     when the user clicks an individual notification.
 *   - Without `ids`: every unread row owned by the caller is touched.
 *     Used by the "Mark all read" action.
 *
 * Audit-log: we deliberately do NOT write per-mark audit rows. This is
 * a high-volume read-state mutation — if the user clicks 12 bells per
 * day for years, that's a noisy log for no analytical value. Matches
 * the same call we made in 3.3.1 for `notifications.insert` (the
 * underlying state changes are already audit-logged on the entity).
 */

export type MarkReadState =
  | { error: string }
  | { ok: true; updated: number }
  | undefined;

const MarkReadInput = z.object({
  ids: z.array(z.string().uuid()).optional(),
});

export async function markNotificationsRead(
  _prev: MarkReadState,
  formData: FormData,
): Promise<MarkReadState> {
  const idEntries = formData.getAll("id").map((v) => String(v));
  const parsed = MarkReadInput.safeParse({
    ids: idEntries.length > 0 ? idEntries : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const nowIso = new Date().toISOString();
  let query = supabase
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (parsed.data.ids && parsed.data.ids.length > 0) {
    query = query.in("id", parsed.data.ids);
  }
  const { data, error } = await query.select("id");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, updated: data?.length ?? 0 };
}

/** Convenience form action — wraps markNotificationsRead with no ids. */
export async function markAllNotificationsReadFormAction(): Promise<void> {
  await markNotificationsRead(undefined, new FormData());
}
