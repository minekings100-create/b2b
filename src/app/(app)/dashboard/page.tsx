import { redirect } from "next/navigation";
import { getUserWithRoles } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { hasAnyRole, isAdmin, isHqManager } from "@/lib/auth/roles";
import { AdminDashboard } from "./_components/admin-dashboard";
import { BranchManagerDashboard } from "./_components/branch-manager-dashboard";
import { BranchUserDashboard } from "./_components/branch-user-dashboard";
import { HqManagerDashboard } from "./_components/hq-manager-dashboard";
import { PackerDashboard } from "./_components/packer-dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // The (app) layout also guards, but Next renders layout and page in
  // parallel — the page can start executing before the layout's redirect
  // short-circuits the tree. Re-check here.
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  // Priority: admin/super → HQ manager → branch manager → packer → branch user.
  // HQ slots above BM because the HQ surface (cross-branch awaiting-HQ
  // counter + step-2 queue) is what an HQ-only login wants to see first.
  const picked = isAdmin(session.roles)
    ? "admin"
    : isHqManager(session.roles)
      ? "hq"
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
        {picked === "hq" ? <HqManagerDashboard /> : null}
        {picked === "manager" ? <BranchManagerDashboard /> : null}
        {picked === "packer" ? <PackerDashboard /> : null}
        {picked === "user" ? <BranchUserDashboard /> : null}
      </div>
    </>
  );
}
