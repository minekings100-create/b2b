import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";

export const metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices" description="Invoicing ships in Phase 5." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No invoices yet"
          description="Issued and paid invoices will appear here starting in Phase 5."
        />
      </div>
    </>
  );
}
