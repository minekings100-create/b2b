import { NextResponse } from "next/server";

import { getUserWithRoles } from "@/lib/auth/session";
import { fetchInvoiceDetail } from "@/lib/db/invoices";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/pdf/invoice/[invoiceId] — streams the invoice PDF.
 *
 * Auth: any authenticated caller whose RLS lets them read the invoice
 * (admin/super globally; branch user/manager for their branch). The
 * `fetchInvoiceDetail` loader runs under the user's session client —
 * if RLS hides the row, the loader returns null and we 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: { invoiceId: string } },
): Promise<Response> {
  const session = await getUserWithRoles();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const detail = await fetchInvoiceDetail(params.invoiceId);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await renderInvoicePdf({
    invoice_number: detail.invoice_number,
    issued_at: detail.issued_at,
    due_at: detail.due_at,
    branch_code: detail.branch_code,
    branch_name: detail.branch_name,
    order_number: detail.order_number,
    lines: detail.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
      line_net_cents: l.line_net_cents,
      line_vat_cents: l.line_vat_cents,
    })),
    total_net_cents: detail.total_net_cents,
    total_vat_cents: detail.total_vat_cents,
    total_gross_cents: detail.total_gross_cents,
    status: detail.status,
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${detail.invoice_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
