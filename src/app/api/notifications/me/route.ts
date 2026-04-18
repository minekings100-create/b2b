import { NextResponse } from "next/server";
import { fetchMyNotifications } from "@/lib/db/notifications";

/**
 * Bell-poll endpoint. Returns the same `NotificationsSnapshot` the
 * server component renders on first paint, but client-side so the
 * bell can refresh without a full page navigation.
 *
 * No request body, no params — RLS scopes by `auth.uid()`. 401 when
 * the user is signed out (the bell shouldn't poll in that case but
 * a stale interval right after sign-out shouldn't crash the UI).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const snapshot = await fetchMyNotifications();
    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load notifications" },
      { status: 500 },
    );
  }
}
