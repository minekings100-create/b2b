import { NotificationsBellClient } from "./notifications-bell.client";

/**
 * Server wrapper. Renders the bell with an empty initial snapshot and
 * lets the client effect run its first `/api/notifications/me` fetch
 * on mount.
 *
 * Why no server-side fetch: the AppShell wraps every authenticated
 * page, so a server fetch here adds 2–3 Supabase round-trips to every
 * page render (auth.getUser + count + recent). Across a full Playwright
 * suite that compounds enough to push some tests past their 30 s
 * timeout. The badge popping in 100 ms after mount is an acceptable UX
 * trade — the alternative is a Suspense boundary that adds plumbing
 * for the same end result.
 *
 * The client component still fires its first fetch immediately
 * (`refresh()` runs on mount via the visibility-change effect, which
 * also fires for `visibilityState === "visible"` at start).
 */
export function NotificationsBell() {
  return (
    <NotificationsBellClient initial={{ unread_count: 0, recent: [] }} />
  );
}
