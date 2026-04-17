import { redirect } from "next/navigation";
import { getUserWithRoles } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { isAdmin, hasAnyRole } from "@/lib/auth/roles";
import { AdminDashboard } from "./_components/admin-dashboard";
import { BranchManagerDashboard } from "./_components/branch-manager-dashboard";
import { BranchUserDashboard } from "./_components/branch-user-dashboard";
import { PackerDashboard } from "./_components/packer-dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // The (app) layout also guards, but Next renders layout and page in
  // parallel — the page can start executing before the layout's redirect
  // short-circuits the tree. Re-check here.
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  // Priority: super_admin / administration → branch_manager → packer → branch_user
  const picked = isAdmin(session.roles)
    ? "admin"
    : hasAnyRole(session.roles, ["branch_manager"])
      ? "manager"
      : hasAnyRole(session.roles, ["packer"])
        ? "packer"
        : "user";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${session.user.email}`}
      />
      <div className="px-gutter py-6">
        {picked === "admin" ? <AdminDashboard /> : null}
        {picked === "manager" ? <BranchManagerDashboard /> : null}
        {picked === "packer" ? <PackerDashboard /> : null}
        {picked === "user" ? <BranchUserDashboard /> : null}
      </div>
    </>
  );
}
