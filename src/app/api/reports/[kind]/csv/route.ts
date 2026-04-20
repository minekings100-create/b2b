import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { getUserWithRoles } from "@/lib/auth/session";
import { canSeeReport, isReportKind, type ReportKind } from "@/lib/auth/reports";
import {
  fetchArAging,
  fetchPackerThroughput,
  fetchSpendByBranch,
  fetchTopProducts,
} from "@/lib/db/reports";
import {
  buildCsv,
  centsToDecimalString,
  contentDisposition,
} from "@/lib/reports/csv";
import { parseWindow } from "@/app/(app)/reports/_lib/window";

/**
 * Phase 7b-2c — CSV export route.
 *
 * One handler dispatches by the `[kind]` segment. Reuses the same
 * access helper as the pages (`canSeeReport`) so a rogue URL can't
 * leak data that the page would redirect away from.
 *
 * Window parsing is identical to the page version so `/reports/x
 * ?from=A&to=B` and the CSV link produce the same rows.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: { kind: string } },
): Promise<Response> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const { kind } = context.params;
  if (!isReportKind(kind)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }
  if (!canSeeReport(kind as ReportKind, session.roles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const flatParams: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    flatParams[k] = v;
  });
  const w = parseWindow(flatParams);

  const { csv, filename } = await buildCsvForKind(kind, w);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store",
    },
  });
}

type Window = ReturnType<typeof parseWindow>;

async function buildCsvForKind(
  kind: ReportKind,
  w: Window,
): Promise<{ csv: string; filename: string }> {
  switch (kind) {
    case "spend-by-branch": {
      const rows = await fetchSpendByBranch(w);
      const csv = buildCsv(
        ["branch_code", "branch_name", "invoice_count", "total_gross_eur"],
        rows.map((r) => [
          r.branch_code,
          r.branch_name,
          r.invoice_count,
          centsToDecimalString(r.total_gross_cents),
        ]),
      );
      return { csv, filename: `spend-by-branch_${w.from}_${w.to}.csv` };
    }
    case "top-products": {
      const rows = await fetchTopProducts(w, 200);
      const csv = buildCsv(
        ["sku", "name", "quantity", "line_net_eur"],
        rows.map((r) => [
          r.sku,
          r.name,
          r.quantity,
          centsToDecimalString(r.line_net_cents),
        ]),
      );
      return { csv, filename: `top-products_${w.from}_${w.to}.csv` };
    }
    case "ar-aging": {
      const { rows } = await fetchArAging();
      const csv = buildCsv(
        [
          "invoice_number",
          "branch_code",
          "branch_name",
          "due_at",
          "days_overdue",
          "bucket",
          "total_gross_eur",
        ],
        rows.map((r) => [
          r.invoice_number,
          r.branch_code,
          r.branch_name,
          r.due_at.slice(0, 10),
          r.days_overdue,
          r.bucket,
          centsToDecimalString(r.total_gross_cents),
        ]),
      );
      return {
        csv,
        filename: `ar-aging_${new Date().toISOString().slice(0, 10)}.csv`,
      };
    }
    case "packer-throughput": {
      const rows = await fetchPackerThroughput(w);
      const csv = buildCsv(
        ["packer_email", "packer_name", "pallet_count", "order_count"],
        rows.map((r) => [
          r.email,
          r.full_name ?? "",
          r.pallet_count,
          r.order_count,
        ]),
      );
      return { csv, filename: `packer-throughput_${w.from}_${w.to}.csv` };
    }
  }
}
