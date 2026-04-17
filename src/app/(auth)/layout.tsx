import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-fg text-sm font-semibold shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.14),inset_0_1px_0_0_rgb(255_255_255/0.08)]">
            PP
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-fg">Procurement</h1>
            <p className="text-sm text-fg-muted">Internal access only.</p>
          </div>
        </header>
        {children}
        <footer className="flex items-center justify-between border-t border-border pt-4 text-xs text-fg-subtle">
          <Link href="/" className="hover:text-fg">Home</Link>
          <span>SPEC §4</span>
        </footer>
      </div>
    </div>
  );
}
