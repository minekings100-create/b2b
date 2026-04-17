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
import { CategoryRow } from "./_components/category-row";
import { CreateCategoryForm } from "./_components/create-category-form";

export const metadata = { title: "Catalog categories" };

export default async function CategoriesPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/catalog");

  const categories = await fetchCategoriesWithCounts();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Flat catalog taxonomy. Nesting is supported in the schema but not exposed here yet."
        breadcrumbs={[
          { label: "Catalog", href: "/catalog" },
          { label: "Categories" },
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
      <div className="space-y-4 px-gutter py-6">
        <CreateCategoryForm />

        {categories.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-5 w-5" />}
            title="No categories yet"
            description="Add your first category using the form above."
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px] text-right">Products</TableHead>
                  <TableHead className="w-[120px] text-right">&nbsp;</TableHead>
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
