import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";

export const metadata = { title: "Pack queue" };

export default function PackPage() {
  return (
    <>
      <PageHeader title="Pack queue" description="Packer workspace ships in Phase 4." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="Nothing to pack"
          description="Approved orders ready for picking will appear here in Phase 4."
        />
      </div>
    </>
  );
}
