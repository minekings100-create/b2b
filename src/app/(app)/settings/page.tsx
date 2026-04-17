import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings } from "lucide-react";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Settings are super-admin-only and ship alongside admin tooling." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Settings className="h-5 w-5" />}
          title="No settings yet"
          description="VAT rates, invoice prefixes, payment defaults and email templates will live here."
        />
      </div>
    </>
  );
}
