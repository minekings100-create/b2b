import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-gutter py-12">
      <p className="label-meta">Design system · §4</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Internal procurement platform
      </h1>
      <p className="text-sm text-fg-muted">
        Phase 0 — design tokens and base components. No feature code yet.
      </p>
      <div>
        <Link
          href="/design"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          View design system
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </main>
  );
}
