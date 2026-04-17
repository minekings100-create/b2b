import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Reporting ships in Phase 7." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No reports yet"
          description="Spend, throughput and AR aging reports will live here from Phase 7."
        />
      </div>
    </>
  );
}
