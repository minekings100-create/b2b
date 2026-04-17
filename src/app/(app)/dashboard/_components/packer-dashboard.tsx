import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";

export function PackerDashboard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EmptyState
        icon={<Package className="h-5 w-5" />}
        title="Nothing to pack"
        description="Approved orders ready for picking will appear here in Phase 4."
      />
    </div>
  );
}
