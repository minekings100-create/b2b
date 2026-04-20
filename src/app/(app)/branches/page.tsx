import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";

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
import { fetchAdminBranches } from "@/lib/db/branches-admin";
import { ArchivedToggle } from "@/components/app/archived-primitives";

import { BranchRow } from "./_components/branch-row";

export const metadata = { title: "Branches" };

/**
 * Phase 7b-2b — admin-only list of branches with archive / restore.
 *
 * Read-only in terms of branch attributes (create + edit live in a
 * later phase, once the auth/user provisioning surface also lands).
 * The archive toggle switches between the active set and the
 * soft-deleted set.
 */
export default async function BranchesPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const showArchived = searchParams.archived === "1";
  const branches = await fetchAdminBranches({ archivedOnly: showArchived });

  return (
    <>
      <PageHeader
        title={showArchived ? "Branches — archived" : "Branches"}
        description={
          showArchived
            ? "Restore to re-enable ordering + appearance in branch pickers."
            : "One HQ, many branches. Archive hides a branch from pickers without deleting historical orders."
        }
        actions={
          <div className="flex items-center gap-2">
            <ArchivedToggle
              showArchived={showArchived}
              hrefOn="/branches?archived=1"
              hrefOff="/branches"
            />
            {!showArchived ? (
              <Link
                href="/branches/new"
                className={cn(
                  buttonVariants({ variant: "primary", size: "default" }),
                )}
                data-testid="create-branch-button"
              >
                <Plus className="h-3.5 w-3.5" />
                Create branch
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="px-gutter py-6">
        {branches.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={showArchived ? "No archived branches" : "No branches"}
            description={
              showArchived
                ? "Archived branches will show up here when an admin archives one."
                : "Create the first branch in Studio — admin UI lands in a later phase."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="w-[160px] text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <BranchRow
                    key={b.id}
                    row={{
                      id: b.id,
                      branch_code: b.branch_code,
                      name: b.name,
                      email: b.email,
                      phone: b.phone,
                      archived: b.deleted_at !== null,
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
