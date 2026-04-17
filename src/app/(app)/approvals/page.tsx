import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader title="Approvals" description="Approval queue ships in Phase 3." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Nothing awaiting approval"
          description="Submitted orders for your branches will land here in Phase 3."
        />
      </div>
    </>
  );
}
