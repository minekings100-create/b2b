import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingCart } from "lucide-react";

export function BranchUserDashboard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EmptyState
        icon={<ShoppingCart className="h-5 w-5" />}
        title="No recent orders"
        description="Your branch's orders will appear here once Phase 3 ships."
      />
    </div>
  );
}
