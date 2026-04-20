import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Users as UsersIcon } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { fetchAdminUsers } from "@/lib/db/users-admin";
import { ArchivedToggle } from "@/components/app/archived-primitives";

import { UserRow } from "./_components/user-row";

export const metadata = { title: "Users" };

/**
 * Phase 7b-2b — admin-only list of users with archive / restore.
 *
 * Read-only in terms of user attributes (create, edit, role assignment
 * all need the Supabase Auth admin API + form validation pass; deferred
 * to a later phase). The archive toggle switches between the active
 * set and the soft-deleted set.
 *
 * NOTE: archiving a user flips `public.users.{active, deleted_at}` but
 * does NOT touch `auth.users`. An archived user with a valid session
 * can still reach the app until their session cookie expires. Hard
 * deactivation via the Supabase Auth admin API is a separate phase.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const showArchived = searchParams.archived === "1";
  const users = await fetchAdminUsers({ archivedOnly: showArchived });

  return (
    <>
      <PageHeader
        title={showArchived ? "Users — archived" : "Users"}
        description={
          showArchived
            ? "Restore to bring a user back into pickers, dashboards, and dropdowns."
            : "Everyone with a role in the app. Archive hides a user from pickers without deleting their history."
        }
        actions={
          <div className="flex items-center gap-2">
            <ArchivedToggle
              showArchived={showArchived}
              hrefOn="/users?archived=1"
              hrefOff="/users"
            />
            {!showArchived ? (
              <Link
                href="/users/new"
                className={cn(
                  buttonVariants({ variant: "primary", size: "default" }),
                )}
                data-testid="invite-user-button"
              >
                <Plus className="h-3.5 w-3.5" />
                Invite user
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="px-gutter py-6">
        {users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title={showArchived ? "No archived users" : "No users listed"}
            description={
              showArchived
                ? "Archived users will show up here when an admin archives one."
                : "User administration ships in a later phase. Seed via scripts/seed.ts for now."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Name</TableHead>
                  <TableHead className="hidden lg:table-cell w-[260px]">
                    Roles
                  </TableHead>
                  <TableHead className="w-[160px] text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    row={{
                      id: u.id,
                      email: u.email,
                      full_name: u.full_name,
                      roles: u.roles,
                      archived: u.deleted_at !== null,
                      is_self: u.id === session.user.id,
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
