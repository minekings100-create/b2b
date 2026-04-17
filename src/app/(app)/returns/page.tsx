import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Archive } from "lucide-react";

export const metadata = { title: "Returns" };

export default function ReturnsPage() {
  return (
    <>
      <PageHeader title="Returns" description="RMA workflow ships in Phase 6." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Archive className="h-5 w-5" />}
          title="No returns yet"
          description="Return requests and RMAs will be tracked here from Phase 6."
        />
      </div>
    </>
  );
}
