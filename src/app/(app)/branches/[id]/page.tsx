import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

import { BranchForm } from "../_components/branch-form.client";

export const metadata = { title: "Branch detail" };

export default async function BranchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const adm = createAdminClient();
  const { data: branch } = await adm
    .from("branches")
    .select(
      "id, name, branch_code, email, phone, visiting_address, billing_address, shipping_address, kvk_number, vat_number, iban, monthly_budget_cents, payment_term_days, deleted_at",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!branch) notFound();

  return (
    <>
      <PageHeader
        title={branch.name}
        description={
          <span className="inline-flex items-center gap-2">
            <span>{branch.branch_code}</span>
            {branch.deleted_at ? (
              <span className="inline-flex items-center rounded-sm bg-fg-subtle/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                Archived
              </span>
            ) : null}
          </span>
        }
        breadcrumbs={[
          { label: "Branches", href: "/branches" },
          { label: branch.branch_code },
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
        <BranchForm mode="edit" initial={branch} />
      </div>
    </>
  );
}
