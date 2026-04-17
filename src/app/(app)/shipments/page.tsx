import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Truck } from "lucide-react";

export const metadata = { title: "Shipments" };

export default function ShipmentsPage() {
  return (
    <>
      <PageHeader title="Shipments" description="Shipment tracking ships in Phase 4." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="No shipments yet"
          description="Outbound shipments will be listed here once packing is live."
        />
      </div>
    </>
  );
}
