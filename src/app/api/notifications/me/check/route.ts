import { NextResponse } from "next/server";
import { z } from "zod";
import { isNotificationTargetReachable } from "@/lib/db/notifications";

/**
 * Race-time defensive check used by the bell's click handler.
 *
 * Why we need it: `fetchMyNotifications` already drops orphan rows
 * before they reach the dropdown (see `dropOrphanedNotifications` in
 * `src/lib/db/notifications.ts`). But there's still a small window —
 * the order can be deleted between the dropdown render and the user's
 * click — where the bell would route to a 404. The bell client hits
 * this endpoint right before `router.push` and falls back to an inline
 * "no longer available" message when the response is `{ ok: false }`.
 *
 * Returns 200 always so the client doesn't have to distinguish
 * network errors from "order missing".
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  id: z.string().uuid(),
});

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid_id" });
  }
  try {
    const ok = await isNotificationTargetReachable(parsed.data.id);
    return NextResponse.json({ ok });
  } catch {
    // Don't leak the underlying error — the client just needs a
    // boolean. Treat unknown failures as "navigate anyway" (false
    // negatives are worse than false positives here).
    return NextResponse.json({ ok: true });
  }
}
