import { redirect } from "next/navigation";
import { getUserWithRoles } from "@/lib/auth/session";

/**
 * Minimal auth gate for Phase 1.2. Any route under the (app) group requires
 * a signed-in user; unauthenticated requests redirect to /login.
 *
 * 1.3 replaces this with the full AppShell (sidebar + command palette).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  return <>{children}</>;
}
