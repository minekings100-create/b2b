import { AppSidebar } from "./app-sidebar";
import { NotificationsBell } from "./notifications-bell";
import type { RoleAssignment } from "@/lib/auth/roles";

/**
 * Top-level app chrome. Sidebar on the left, a thin top bar on the
 * right that hosts global controls (the 3.3.2 notifications bell —
 * future global actions like ⌘K trigger or a workspace switcher land
 * here too). Page content sits below the top bar and renders its own
 * `<PageHeader>` for breadcrumbs + per-page actions.
 */
export function AppShell({
  roles,
  email,
  children,
}: {
  roles: readonly RoleAssignment[];
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar roles={roles} email={email} />
      <div className="flex flex-1 flex-col">
        <header
          className="flex h-12 items-center justify-end gap-2 border-b border-border bg-bg/60 px-gutter backdrop-blur"
          aria-label="Workspace top bar"
        >
          <NotificationsBell />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
