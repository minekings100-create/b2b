import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Lock, Unlock } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isSuperAdmin } from "@/lib/auth/roles";
import { formatShortDate } from "@/lib/dates/format";
import {
  fetchAdminBranchesLite,
  fetchAdminUserDetail,
} from "@/lib/db/users-admin";

import { ProfileForm } from "./_components/profile-form.client";
import { RoleAssignmentsEditor } from "./_components/role-assignments-editor.client";
import {
  DeactivateToggle,
  PasswordResetButton,
} from "./_components/danger-zone.client";

export const metadata = { title: "User detail" };

export default async function UserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const [user, branches] = await Promise.all([
    fetchAdminUserDetail(params.id),
    fetchAdminBranchesLite(),
  ]);
  if (!user) notFound();

  const canGrantSuperAdmin = isSuperAdmin(session.roles);
  const isSelf = user.id === session.user.id;

  return (
    <>
      <PageHeader
        title={user.full_name ?? user.email}
        description={
          <span className="inline-flex items-center gap-2">
            <span>{user.email}</span>
            {user.login_disabled ? (
              <span className="inline-flex items-center gap-1 rounded-sm bg-danger-subtle/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
                <Lock className="h-3 w-3" aria-hidden /> Login disabled
              </span>
            ) : null}
            {user.deleted_at ? (
              <span className="inline-flex items-center rounded-sm bg-fg-subtle/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                Archived
              </span>
            ) : null}
          </span>
        }
        breadcrumbs={[
          { label: "Users", href: "/users" },
          { label: user.email },
        ]}
        actions={
          <Link
            href="/users"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />
      <div className="space-y-6 px-gutter py-6">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Profile</h2>
          <ProfileForm
            userId={user.id}
            initialFullName={user.full_name ?? ""}
            email={user.email}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Role assignments</h2>
          <RoleAssignmentsEditor
            userId={user.id}
            branches={branches}
            assignments={user.assignments}
            canGrantSuperAdmin={canGrantSuperAdmin}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Account controls</h2>
          <div className="rounded-lg bg-surface p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[260px] space-y-1">
                <p className="text-sm font-medium text-fg">Password reset</p>
                <p className="text-xs text-fg-muted">
                  Sends the user a Supabase password reset email with a
                  set-password link.
                </p>
              </div>
              <PasswordResetButton userId={user.id} email={user.email} />
            </div>
            <hr className="my-4 border-border" />
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[260px] space-y-1">
                <p className="text-sm font-medium text-fg">
                  Login {user.login_disabled ? "disabled" : "enabled"}
                </p>
                <p className="text-xs text-fg-muted">
                  {user.login_disabled ? (
                    <>
                      <Unlock className="mr-1 inline h-3 w-3" aria-hidden />
                      User cannot sign in. Re-enable to restore access.
                    </>
                  ) : (
                    <>
                      <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                      Disable to prevent this user from signing in. Does NOT
                      archive or delete the user — their data and history
                      stay intact.
                    </>
                  )}
                </p>
              </div>
              {isSelf ? (
                <p className="text-[11px] text-fg-subtle">
                  You can't disable your own login.
                </p>
              ) : (
                <DeactivateToggle
                  userId={user.id}
                  email={user.email}
                  loginDisabled={user.login_disabled}
                />
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Current assignments</h2>
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="w-[180px]">Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-fg-muted">
                      No active assignments.
                    </TableCell>
                  </TableRow>
                ) : (
                  user.assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.role}</TableCell>
                      <TableCell className="text-fg-muted">
                        {a.branch_id
                          ? `${a.branch_code} — ${a.branch_name}`
                          : "global"}
                      </TableCell>
                      <TableCell className="font-numeric text-xs text-fg-muted">
                        {formatShortDate(a.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </>
  );
}
