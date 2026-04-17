import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Box } from "lucide-react";

export const metadata = { title: "Catalog" };

export default function CatalogPage() {
  return (
    <>
      <PageHeader title="Catalog" description="Catalog management ships in Phase 2." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Box className="h-5 w-5" />}
          title="No products yet"
          description="Products, categories and inventory will be managed here from Phase 2."
        />
      </div>
    </>
  );
}
