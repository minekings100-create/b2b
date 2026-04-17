import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

export const metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <>
      <PageHeader title="Users" description="User and role management ships alongside admin tooling." />
      <div className="px-gutter py-6">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No users listed"
          description="User administration will be built out in later phases."
        />
      </div>
    </>
  );
}
