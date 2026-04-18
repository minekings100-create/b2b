import { Package, History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Pack queue" };

/**
 * Sub-milestone 3.2.1 stubs the structure that Phase 4 will fill in:
 * - "Queue" lists approved/picking orders for any packer (existing scope).
 * - "My completed" lists orders the signed-in packer personally packed —
 *   driven by the per-pallet `packed_by_user_id` column landed in §1.5.
 *
 * Both sections render placeholder empty states until Phase 4 wires the
 * data layer.
 */
export default function PackPage() {
  return (
    <>
      <PageHeader
        title="Pack queue"
        description="Packer workspace ships in Phase 4."
      />
      <div className="space-y-8 px-gutter py-6">
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Queue</h2>
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Nothing to pack"
            description="Approved orders ready for picking will appear here in Phase 4."
          />
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">My completed</h2>
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No completed orders yet"
            description="Orders you personally pack will appear here in Phase 4 with full activity timeline access."
          />
        </section>
      </div>
    </>
  );
}
