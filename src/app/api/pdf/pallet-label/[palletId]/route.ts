import { NextResponse } from "next/server";

import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { renderPalletLabelPdf } from "@/lib/pdf/pallet-label";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // react-pdf needs Node, not Edge.

/**
 * GET /api/pdf/pallet-label/[palletId] — returns the PDF as the response
 * body with `Content-Disposition: inline` so the browser previews it.
 *
 * Auth: any authenticated packer / admin / super_admin. RLS on `pallets`
 * already gates the underlying read; we double-check the role here so
 * the route returns 403 rather than a 404 for a wrong-role caller.
 */
export async function GET(
  _req: Request,
  { params }: { params: { palletId: string } },
): Promise<Response> {
  const session = await getUserWithRoles();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyRole(session.roles, ["packer", "administration", "super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient();
  const { data: pallet, error } = await supabase
    .from("pallets")
    .select(
      `
        id, pallet_number, packed_at, packed_by_user_id,
        orders!inner (
          order_number,
          branches!inner ( branch_code, name )
        ),
        pallet_items ( id )
      `,
    )
    .eq("id", params.palletId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !pallet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let packerEmail: string | null = null;
  if (pallet.packed_by_user_id) {
    const { data: u } = await supabase
      .from("users")
      .select("email")
      .eq("id", pallet.packed_by_user_id)
      .maybeSingle();
    packerEmail = u?.email ?? null;
  }

  const buf = await renderPalletLabelPdf({
    pallet_id: pallet.id,
    pallet_number: pallet.pallet_number,
    order_number: pallet.orders!.order_number,
    branch_code: pallet.orders!.branches!.branch_code,
    branch_name: pallet.orders!.branches!.name,
    item_count: (pallet.pallet_items ?? []).length,
    packed_at: pallet.packed_at,
    packed_by_email: packerEmail,
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pallet.pallet_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
