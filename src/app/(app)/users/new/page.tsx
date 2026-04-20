import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isSuperAdmin } from "@/lib/auth/roles";
import { fetchAdminBranchesLite } from "@/lib/db/users-admin";

import { InviteUserForm } from "./_components/invite-user-form.client";

export const metadata = { title: "Invite user" };

export default async function InviteUserPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const branches = await fetchAdminBranchesLite();

  return (
    <>
      <PageHeader
        title="Invite user"
        description="Create a new user, assign roles, and send them a Supabase Auth invite email with a set-password link."
        breadcrumbs={[
          { label: "Users", href: "/users" },
          { label: "Invite" },
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
      <div className="px-gutter py-6">
        <InviteUserForm
          branches={branches}
          canGrantSuperAdmin={isSuperAdmin(session.roles)}
        />
      </div>
    </>
  );
}
