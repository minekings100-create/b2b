import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";

export function AdminDashboard() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="No activity yet"
        description="Spend, throughput and invoicing metrics will appear here as phases land."
      />
    </div>
  );
}
