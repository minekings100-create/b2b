import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserWithRoles } from "@/lib/auth/session";
import {
  REPORT_META,
  reportsVisibleTo,
} from "@/lib/auth/reports";

export const metadata = { title: "Reports" };

/**
 * Phase 7b-2c — reports index. Shows one card per report the caller
 * can see. Access is enforced per-report: admin sees all four, HQ
 * Manager sees three (no AR aging), everyone else redirects to
 * /dashboard.
 */
export default async function ReportsPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  const visible = reportsVisibleTo(session.roles);
  if (visible.length === 0) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Reports"
        description="Point-in-time aggregates over orders, invoices and fulfilment. Pick a window on each report."
      />
      <div className="px-gutter py-6">
        {visible.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="No reports available"
            description="Your role has no reports assigned."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((kind) => {
              const meta = REPORT_META[kind];
              return (
                <Link
                  key={kind}
                  href={meta.href}
                  data-testid={`report-card-${kind}`}
                  className="block rounded-lg bg-surface p-4 ring-1 ring-border transition-colors duration-150 hover:bg-surface-elevated"
                >
                  <p className="text-sm font-semibold text-fg">{meta.title}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {meta.description}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
