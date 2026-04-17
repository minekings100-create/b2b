import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

export function BranchManagerDashboard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="Approval queue empty"
        description="Submitted orders awaiting your review will land here in Phase 3."
      />
    </div>
  );
}
