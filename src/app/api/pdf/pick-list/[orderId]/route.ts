import { NextResponse } from "next/server";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { fetchPickList } from "@/lib/db/packing";
import { renderPickListPdf } from "@/lib/pdf/pick-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/pdf/pick-list/[orderId] — printable pick list PDF for the
 * packer. Same role gate + RLS-backed read as the on-screen pick list.
 */
export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } },
): Promise<Response> {
  const session = await getUserWithRoles();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyRole(session.roles, ["packer", "administration", "super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const detail = await fetchPickList(params.orderId);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await renderPickListPdf({
    order_number: detail.order_number,
    branch_code: detail.branch_code,
    branch_name: detail.branch_name,
    approved_at: detail.approved_at,
    notes: detail.notes,
    lines: detail.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      warehouse_location: l.warehouse_location,
      quantity_approved: l.quantity_approved,
    })),
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="picklist-${detail.order_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
