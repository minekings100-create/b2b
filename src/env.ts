import { z } from "zod";

/**
 * Single source of truth for environment variables (SPEC §13 step 10).
 * Parsed at first import. Fails fast with a descriptive error listing every
 * missing / malformed variable.
 *
 *   - `NEXT_PUBLIC_*` fields are safe to import from client components.
 *   - Everything else is server-only — importing this module from a client
 *     component will inline-strip the secret fields at build time *only if*
 *     no client component reads them; to be safe we also guard the admin
 *     client at runtime (`src/lib/supabase/admin.ts`).
 */
const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "anon key missing or too short"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "service_role key missing or too short"),
  SUPABASE_PROJECT_REF: z.string().min(10),
});

const ClientEnvSchema = ServerEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

const isServer = typeof window === "undefined";

function parseEnv() {
  const schema = isServer ? ServerEnvSchema : ClientEnvSchema;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof ServerEnvSchema>;
