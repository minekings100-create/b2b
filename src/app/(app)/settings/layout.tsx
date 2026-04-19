import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * 3.3.3a step 7 — /settings shell.
 *
 * Lives inside the (app) route group so it inherits the authenticated
 * `AppShell` (sidebar + top bar). This layout only adds a second,
 * settings-scoped navigation column on the left of the content area.
 *
 * For now the sub-nav has a single entry (Notifications). Future
 * settings sections (profile, security, admin-only screens) go here
 * alongside; when there are ≥2 entries upgrade to a client component
 * that highlights the active item via `usePathname`.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 gap-6 px-6 py-4">
      <aside className="w-56 shrink-0">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Settings
        </h2>
        <nav className="flex flex-col gap-0.5">
          <Link
            href="/settings/notifications"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-fg"
          >
            <Bell className="h-4 w-4" aria-hidden />
            Notifications
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
