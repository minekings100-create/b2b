import { redirect } from "next/navigation";

import { getUserWithRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { NotificationCategory } from "@/lib/email/categories";

import { NotificationsForm } from "./_components/notifications-form.client";

export const metadata = {
  title: "Notifications — Settings",
};

type PrefShape = Record<
  NotificationCategory,
  { email: boolean; in_app: boolean }
>;

/**
 * 3.3.3a step 7 — notification preferences settings page.
 *
 * Server Component. Reads the current user's row under their session
 * (RLS self-select covers this) and seeds the client form with the
 * stored prefs. The save action `revalidatePath`s this page so the
 * form re-renders with server-authoritative values after each save.
 */
const PERMISSIVE_DEFAULT: PrefShape = {
  state_changes: { email: true, in_app: true },
  admin_alerts: { email: true, in_app: true },
};

export default async function NotificationsSettingsPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { data: row } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", session.user.id)
    .maybeSingle();

  // Fall back to the permissive default if the row read returns null or
  // a malformed shape — matches notify()'s "over-notify on a hiccup"
  // philosophy on the read side too.
  const prefs = (row?.notification_preferences ?? PERMISSIVE_DEFAULT) as PrefShape;

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-fg">
        Notifications
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        Choose how you receive updates from the procurement portal. Email
        covers durable notices sent to your inbox; in-app shows up in the
        bell dropdown.
      </p>
      <NotificationsForm initial={prefs} />
    </div>
  );
}
