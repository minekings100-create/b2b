# Environment Variables

Every env var used in this project is documented here (SPEC §13 step 10).

## How to use

1. Copy `.env.example` → `.env.local`.
2. Fill in real values. `.env.local` is gitignored.
3. Vercel deployments: set the same variables in the Vercel project dashboard. Mark `NEXT_PUBLIC_*` vars as exposed; mark everything else as server-only.
4. Never paste secrets into chat, code, tests, screenshots, or commits.

---

## Variables

### `NEXT_PUBLIC_SUPABASE_URL`
- **Purpose:** Base URL of the hosted Supabase project (Postgres + Auth + Storage).
- **Where to find:** Supabase dashboard → Project Settings → API → Project URL.
- **Exposed to browser:** Yes (`NEXT_PUBLIC_` prefix).
- **Used by:** Server Components, Client Components, Server Actions, Route Handlers, migration scripts.

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Purpose:** Anonymous (public) API key. All client-side queries go through this key — RLS enforces access control, not this key's scope.
- **Where to find:** Supabase dashboard → Project Settings → API → `anon / public`.
- **Exposed to browser:** Yes.
- **Sensitivity:** Low — anyone on the internet can see this key. Security depends entirely on correct RLS policies.

### `SUPABASE_SERVICE_ROLE_KEY`
- **Purpose:** Admin-level key that bypasses Row Level Security. Used for migrations, seed scripts, and server-only operations that legitimately need to read/write across every row regardless of the caller's identity.
- **Where to find:** Supabase dashboard → Project Settings → API → `service_role / secret`.
- **Exposed to browser:** **NEVER.** Importing this from a Client Component leaks full database access. Runtime must be Server Components, Server Actions, Route Handlers, or standalone Node scripts.
- **Rotation:** Rotate after anyone who shouldn't have it has seen it. The Supabase dashboard has a "Reveal / Regenerate" control.

### `SUPABASE_PROJECT_REF`
- **Purpose:** The short project identifier (the subdomain in the Supabase URL). Used by the Supabase CLI to link a local checkout to the right remote project (`supabase link --project-ref <ref>`).
- **Exposed to browser:** No.

### `SUPABASE_ACCESS_TOKEN`
- **Purpose:** Personal access token for the Supabase CLI (`supabase db push`, `supabase gen types`, etc.). Generated per-user.
- **Where to find:** <https://supabase.com/dashboard/account/tokens>. Create a token scoped `dev` or narrower.
- **Alternative:** Run `supabase login` interactively once; the CLI stores a session token locally. This env var is only needed in non-interactive environments (CI, this project's scripts).
- **Exposed to browser:** No.

### `CRON_SECRET`
- **Purpose:** Shared secret that gates the cron route handlers (`/api/cron/*`). Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when the secret is configured on the project.
- **Default if unset:** Cron routes are callable without auth — fine for local dev and e2e tests; **must be set in production** so external callers cannot trigger auto-cancellations.
- **Where to find / generate:** Any high-entropy random string (e.g. `openssl rand -hex 32`). Store in Vercel env, mark as Sensitive.
- **Used by:** `/api/cron/auto-cancel-stale-orders` (3.2.2c). Future cron routes (3.3.x reminders, Phase 5 overdue invoices) reuse the same secret.
- **Exposed to browser:** No.

### `SUPABASE_DB_PASSWORD`
- **Purpose:** Direct database password for connecting Postgres over SSL (used by `supabase db push` when run non-interactively, or by `psql`).
- **Where to find:** Supabase dashboard → Project Settings → Database → Database Password (reveal or reset).
- **Exposed to browser:** No.

---

## Guardrails enforced in code

1. Server-only modules that read `SUPABASE_SERVICE_ROLE_KEY` are marked `import "server-only"` to hard-fail if imported by a Client Component.
2. The Supabase admin client helper (`src/lib/supabase/admin.ts`) throws on import if `typeof window !== "undefined"`.
3. `.env*.local` is gitignored (`.gitignore` line: `.env*.local`). Every other `.env*` file commits only placeholders.
