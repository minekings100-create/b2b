import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { CommandPalette } from "@/components/app/command-palette";
import { getUserWithRoles } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  return (
    <AppShell roles={session.roles} email={session.user.email!}>
      {children}
      <CommandPalette />
    </AppShell>
  );
}
