import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserWithRoles } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/roles";
import { fetchAdminHolidays } from "@/lib/db/public-holidays";

import { CreateHolidayForm } from "./_components/create-holiday-form";
import { HolidayRow } from "./_components/holiday-row";

export const metadata = { title: "Public holidays" };

/**
 * Phase 7b-2a — super_admin-only public holidays manager.
 *
 * Shipped as the admin-facing complement to 7b-1's `public_holidays`
 * table + seed. Without this page, future-year seeding requires
 * Studio access (called out in the 7b-1 PR description).
 */
export default async function HolidaysAdminPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.roles)) redirect("/dashboard");

  const holidays = await fetchAdminHolidays("NL");

  // Group by year so admins can scan the calendar at a glance.
  const byYear = new Map<string, typeof holidays>();
  for (const h of holidays) {
    const year = h.date.slice(0, 4);
    const arr = byYear.get(year) ?? [];
    arr.push(h);
    byYear.set(year, arr);
  }
  const years = Array.from(byYear.keys()).sort();

  return (
    <>
      <PageHeader
        title="Public holidays"
        description="NL public holidays consumed by the working-days helper (auto-cancel cron SLAs). Edits take effect on the next cron tick."
      />
      <div className="space-y-6 px-gutter py-6">
        <CreateHolidayForm />

        {holidays.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="No holidays configured"
            description="Add the first row using the form above."
          />
        ) : (
          years.map((year) => (
            <section key={year} aria-labelledby={`year-${year}`}>
              <h2
                id={`year-${year}`}
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle"
              >
                {year} · {byYear.get(year)!.length} holidays
              </h2>
              <div className="overflow-hidden rounded-lg ring-1 ring-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Date</TableHead>
                      <TableHead className="w-[80px]">Region</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[120px] text-right">
                        &nbsp;
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byYear.get(year)!.map((h) => (
                      <HolidayRow
                        key={h.id}
                        row={{
                          id: h.id,
                          region: h.region,
                          date: h.date,
                          name: h.name,
                        }}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
