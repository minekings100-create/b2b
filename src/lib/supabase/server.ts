import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Cookie reads/writes go through Next's cookies() API so the caller's session
 * is available to every query, and RLS evaluates against their JWT.
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component; writes are a no-op there.
            // Middleware keeps cookies fresh between requests.
          }
        },
      },
    },
  );
}
