import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { CommandPalette } from "@/components/app/command-palette";
import { WelcomeOverlay } from "@/components/app/welcome-overlay.client";
import { getUserWithRoles } from "@/lib/auth/session";
import { welcomeFor } from "@/lib/welcome/copy";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  const showWelcome =
    session.profile != null && session.profile.welcome_dismissed_at == null;
  return (
    <AppShell roles={session.roles} email={session.user.email!}>
      {children}
      <CommandPalette />
      {showWelcome ? (
        <WelcomeOverlay content={welcomeFor(session.roles)} />
      ) : null}
    </AppShell>
  );
}
