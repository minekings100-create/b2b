# Claude Code Instructions

## Primary source of truth

`SPEC.md` in the repo root is the authoritative specification for this project. Always consult it before making architectural, data-model, or design decisions. When the SPEC and a user request conflict, surface the conflict and ask — do not silently override the SPEC.

## Working rules

1. **Read `SPEC.md` at the start of every new session.** Do not rely on memory from previous sessions.
2. **Never skip phases.** The SPEC defines build phases in §11. Do not start a phase until the previous phase's acceptance criteria (§12) are met.
   - **Exception (accepted 2026-04-17):** Phase 1.5 lands every remaining §6 table as schema-only scaffolding (migrations + RLS only — no Server Actions, no UI, no business logic) so a rich demo-data seed can be populated for visual review. Phases 2–6 still ship features per the original §11 order; they simply start against tables that already exist rather than creating their own.
3. **Every new database table gets Row Level Security policies in the same migration that creates it.** No exceptions.
4. **Every mutation writes to `audit_log`.** No exceptions.
5. **Use Server Actions for mutations.** Components are Server Components by default; opt into `"use client"` only when interactivity demands it.
6. **All form input, webhook payloads, and URL params are parsed with Zod at the trust boundary.** Never trust unvalidated input.
7. **Monetary values are integers in cents.** Never floats.
8. **No `any` types.** If you cannot infer a type, use `unknown` and narrow.
9. **No secrets in code.** Env vars only, documented in `/docs/ENV.md`.
10. **Light and dark mode must both work** on every new screen. Verify visually before marking a task complete.

## Design system

The design direction in §4 of `SPEC.md` is not optional styling guidance — it is the contract. Tokens live in `tailwind.config.ts` and as CSS variables. Never introduce new colors, fonts, or radii outside the defined tokens without updating the SPEC first.

If you want to deviate from §4 for a specific reason, flag it and ask — do not just do it.

## When to ask vs. when to proceed

- **Proceed:** when the SPEC is unambiguous, even if the task is large.
- **Ask:** when two parts of the SPEC appear to conflict, when a request contradicts the SPEC, or when the SPEC is silent on something that meaningfully affects architecture.
- **Never:** silently guess at ambiguous product requirements.

## Per-phase workflow

1. Confirm the current phase and its scope from §11.
2. Write migrations first (with RLS).
3. Build server-side logic (Server Actions, route handlers).
4. Build UI using existing base components from the design system.
5. Write tests: unit for logic, Playwright for the happy path.
6. Update `/docs/CHANGELOG.md` and `/docs/ARCHITECTURE.md`.
7. Open a PR with a clear description referencing the phase and the SPEC sections covered.
8. Wait for explicit approval before moving to the next phase.

## Communication

- Keep replies concise. Show diffs, not full files, unless asked.
- When introducing a new pattern (error handling, data fetching, form structure), explain it briefly and then use it consistently across the codebase.
- If you notice the SPEC is outdated or incomplete during implementation, flag it — do not just work around it.
