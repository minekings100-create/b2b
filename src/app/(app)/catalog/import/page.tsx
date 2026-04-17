import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { ImportClient } from "./_components/import-client";

export const metadata = { title: "Import catalog CSV" };

export default async function CatalogImportPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/catalog");

  return (
    <>
      <PageHeader
        title="Import catalog"
        description="Bulk-upload new or updated products from a CSV file."
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Import" },
        ]}
        actions={
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />
      <div className="px-gutter py-6">
        <ImportClient />
      </div>
    </>
  );
}
