import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCart } from "lucide-react";

export const metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" description="Order management lands in Phase 3." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="No orders yet"
          description="This view becomes the list of submitted orders in Phase 3."
        />
      </div>
    </>
  );
}
