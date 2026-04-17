import { redirect } from "next/navigation";
import { getUserWithRoles } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

/**
 * Minimal landing for Phase 1.2 — just proves the session + role query
 * works end-to-end. 1.3 replaces this with role-aware content and the
 * `_components/*-dashboard.tsx` split.
 *
 * Defensive: the (app) layout also guards, but Next.js renders layout and
 * page in parallel, so the page can start executing before the layout's
 * redirect short-circuits the tree.
 */
export default async function DashboardPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${session.user.email}`}
        actions={
          <form action="/logout" method="post">
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md bg-surface px-3 text-sm font-medium text-fg ring-1 ring-inset ring-border hover:bg-surface-elevated hover:ring-border-strong transition-colors"
            >
              Sign out
            </button>
          </form>
        }
      />
      <div className="flex flex-col gap-4 px-gutter py-6">
        <p className="text-sm text-fg-muted">
          Role-aware dashboards land in sub-milestone 1.3. For now, this page
          just verifies the login redirect and session query work end-to-end.
        </p>
        <div className="rounded-lg ring-1 ring-border bg-surface p-4 space-y-3">
          <p className="label-meta">Your role assignments</p>
          {session.roles.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No role assignments yet. Seed data (5 branches, 20 users across
              every role) ships in sub-milestone 1.4.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {session.roles.map((r, i) => (
                <li key={`${r.role}-${r.branch_id ?? "global"}-${i}`}>
                  <Badge variant="accent" dot={false}>
                    {r.role.replace(/_/g, " ")}
                    {r.branch_id ? ` · ${r.branch_id.slice(0, 8)}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
