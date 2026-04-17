import { AppSidebar } from "./app-sidebar";
import type { RoleAssignment } from "@/lib/auth/roles";

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
      <main className="flex-1">{children}</main>
    </div>
  );
}
