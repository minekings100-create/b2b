import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { fetchCategoriesWithCounts } from "@/lib/db/catalog";
import { ArchivedToggle } from "@/components/app/archived-primitives";
import { CategoryRow } from "./_components/category-row";
import { CreateCategoryForm } from "./_components/create-category-form";

export const metadata = { title: "Catalog categories" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/catalog");

  const showArchived = searchParams.archived === "1";
  const categories = await fetchCategoriesWithCounts({
    archivedOnly: showArchived,
  });

  return (
    <>
      <PageHeader
        title={showArchived ? "Categories — archived" : "Categories"}
        description={
          showArchived
            ? "Restore to bring a category back into the active taxonomy."
            : "Flat catalog taxonomy. Nesting is supported in the schema but not exposed here yet."
        }
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Categories" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <ArchivedToggle
              showArchived={showArchived}
              hrefOn="/catalog/categories?archived=1"
              hrefOff="/catalog/categories"
            />
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          </div>
        }
      />
      <div className="space-y-4 px-gutter py-6">
        {!showArchived ? <CreateCategoryForm /> : null}

        {categories.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-5 w-5" />}
            title={
              showArchived ? "No archived categories" : "No categories yet"
            }
            description={
              showArchived
                ? "Archived categories will show up here when an admin archives one."
                : "Add your first category using the form above."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px] text-right">Products</TableHead>
                  <TableHead className="w-[140px] text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <CategoryRow
                    key={c.id}
                    row={{
                      id: c.id,
                      name: c.name,
                      sort_order: c.sort_order,
                      product_count: c.product_count,
                      archived: c.deleted_at !== null,
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
