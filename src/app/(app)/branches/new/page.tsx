import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";

import { BranchForm } from "../_components/branch-form.client";

export const metadata = { title: "Create branch" };

export default async function CreateBranchPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Create branch"
        description="New branch record. Code is uppercase, letters / digits / dash / underscore only."
        breadcrumbs={[
          { label: "Branches", href: "/branches" },
          { label: "Create" },
        ]}
        actions={
          <Link
            href="/branches"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />
      <div className="px-gutter py-6">
        <BranchForm mode="create" />
      </div>
    </>
  );
}
