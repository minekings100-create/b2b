import Link from "next/link";
import { Box, Plus, Tags, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchCatalogCategories,
  fetchCatalogPage,
  fetchProductDetail,
} from "@/lib/db/catalog";
import { formatCents } from "@/lib/money";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { CatalogFilters } from "./_components/catalog-filters";
import { StockPill } from "./_components/stock-pill";
import { ProductDetailDrawer } from "./_components/product-detail-drawer";
import { ProductFormDrawer } from "./_components/product-form-drawer";
import { ProductThumb } from "./_components/product-thumb";
import { CatalogGrid } from "./_components/catalog-grid";
import { ViewToggle } from "./_components/view-toggle";

export const metadata = { title: "Catalog" };

type SearchParams = {
  q?: string;
  cat?: string;
  stock?: string;
  page?: string;
  pid?: string;
  new?: string;
  eid?: string;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pageIdx = Number(searchParams.page ?? 0) || 0;
  const pageSize = 50;

  const [session, categories, { rows, total }] = await Promise.all([
    getUserWithRoles(),
    fetchCatalogCategories(),
    fetchCatalogPage({
      q: searchParams.q,
      categoryId: searchParams.cat,
      inStockOnly: searchParams.stock === "1",
      page: pageIdx,
      pageSize,
    }),
  ]);
  const admin = session ? isAdmin(session.roles) : false;
  const canOrder = session
    ? hasAnyRole(session.roles, ["branch_user", "branch_manager"])
    : false;
  const viewMode: "table" | "grid" =
    session?.profile?.ui_catalog_view === "grid" ? "grid" : "table";

  const selected = searchParams.pid
    ? await fetchProductDetail(searchParams.pid)
    : null;

  // Admin-only form drawer — ignore `?new` / `?eid` for non-admins so a
  // direct URL doesn't render the form.
  const formMode: "create" | "edit" | null = admin
    ? searchParams.new === "1"
      ? "create"
      : searchParams.eid
        ? "edit"
        : null
    : null;
  const formInitial =
    formMode === "edit" && searchParams.eid
      ? await fetchProductDetail(searchParams.eid)
      : null;

  const hasPrev = pageIdx > 0;
  const hasNext = (pageIdx + 1) * pageSize < total;
  const makeHref = (nextPage: number) => {
    const qs = new URLSearchParams();
    if (searchParams.q) qs.set("q", searchParams.q);
    if (searchParams.cat) qs.set("cat", searchParams.cat);
    if (searchParams.stock) qs.set("stock", searchParams.stock);
    if (nextPage > 0) qs.set("page", String(nextPage));
    const s = qs.toString();
    return s ? `/catalog?${s}` : "/catalog";
  };

  const rowHref = (pid: string) => {
    const qs = new URLSearchParams();
    if (searchParams.q) qs.set("q", searchParams.q);
    if (searchParams.cat) qs.set("cat", searchParams.cat);
    if (searchParams.stock) qs.set("stock", searchParams.stock);
    if (searchParams.page) qs.set("page", searchParams.page);
    qs.set("pid", pid);
    return `/catalog?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Catalog"
        description={`${total.toLocaleString("nl-NL")} SKUs available`}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle current={viewMode} />
            {admin ? (
              <>
                <Link
                  href="/catalog/categories"
                  className={cn(buttonVariants({ variant: "ghost", size: "default" }))}
                >
                  <Tags className="h-3.5 w-3.5" />
                  Categories
                </Link>
                <Link
                  href="/catalog/import"
                  className={cn(buttonVariants({ variant: "secondary", size: "default" }))}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                </Link>
                <Link
                  href="/catalog?new=1"
                  className={cn(buttonVariants({ variant: "primary", size: "default" }))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New product
                </Link>
              </>
            ) : null}
          </div>
        }
      />
      <CatalogFilters categories={categories} />

      {rows.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<Box className="h-5 w-5" />}
            title="No products match"
            description={
              searchParams.q || searchParams.cat || searchParams.stock
                ? "Try clearing the filters."
                : "The catalog is empty. Run the seed script to populate it."
            }
          />
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <CatalogGrid rows={rows} rowHref={rowHref} selectedId={searchParams.pid} />
          ) : (
            <div className="px-gutter py-4">
              <div className="overflow-hidden rounded-lg ring-1 ring-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[56px]"></TableHead>
                      <TableHead className="w-[140px]">SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="w-[96px] text-right">Price</TableHead>
                      <TableHead className="hidden lg:table-cell w-[72px] text-right">
                        VAT
                      </TableHead>
                      <TableHead className="w-[72px] text-right">Avail.</TableHead>
                      <TableHead className="w-[120px]">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        selected={searchParams.pid === p.id}
                      >
                        <TableCell className="py-1.5">
                          <Link href={rowHref(p.id)} tabIndex={-1}>
                            <ProductThumb src={p.image_url} alt={p.name} size={40} />
                          </Link>
                        </TableCell>
                        <TableCell className="font-numeric text-fg-muted">
                          <Link
                            href={rowHref(p.id)}
                            className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-sm"
                          >
                            {p.sku}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={rowHref(p.id)} className="block h-full text-fg">
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-fg-muted">
                          {p.category_name ?? "—"}
                        </TableCell>
                        <TableCell numeric>
                          {formatCents(p.unit_price_cents)}
                        </TableCell>
                        <TableCell
                          numeric
                          className="hidden lg:table-cell text-fg-muted"
                        >
                          {p.vat_rate}%
                        </TableCell>
                        <TableCell numeric>{p.available}</TableCell>
                        <TableCell>
                          <StockPill
                            available={p.available}
                            reorderLevel={p.inventory?.reorder_level ?? 0}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between border-t border-border bg-surface px-gutter py-3 text-xs text-fg-muted">
              <span>
                Showing{" "}
                <span className="font-numeric text-fg">
                  {pageIdx * pageSize + 1}
                </span>
                –
                <span className="font-numeric text-fg">
                  {pageIdx * pageSize + rows.length}
                </span>{" "}
                of <span className="font-numeric text-fg">{total}</span>
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={hasPrev ? makeHref(pageIdx - 1) : "#"}
                  aria-disabled={!hasPrev}
                  tabIndex={hasPrev ? 0 : -1}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    !hasPrev && "pointer-events-none opacity-50",
                  )}
                >
                  Previous
                </Link>
                <Link
                  href={hasNext ? makeHref(pageIdx + 1) : "#"}
                  aria-disabled={!hasNext}
                  tabIndex={hasNext ? 0 : -1}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    !hasNext && "pointer-events-none opacity-50",
                  )}
                >
                  Next
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {selected ? (
        <ProductDetailDrawer
          product={selected}
          admin={admin}
          canOrder={canOrder}
        />
      ) : null}

      {formMode === "create" ? (
        <ProductFormDrawer mode="create" categories={categories} />
      ) : null}
      {formMode === "edit" && formInitial ? (
        <ProductFormDrawer
          mode="edit"
          categories={categories}
          initial={formInitial}
        />
      ) : null}
    </>
  );
}
