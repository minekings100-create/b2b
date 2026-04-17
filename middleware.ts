import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Run on every request EXCEPT static assets and image files. Session refresh
   * is cheap; the matcher exists mainly to spare the CDN-cached assets.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|otf)$).*)",
  ],
};
