"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissWelcome } from "@/lib/actions/welcome";
import type { WelcomeContent } from "@/lib/welcome/copy";

/**
 * Post-MVP Sprint 3 — first-login welcome overlay.
 *
 * Renders bottom-right, toast-style but larger. Dismissable with the X
 * or the "Got it" button; both call `dismissWelcome` which stamps
 * `users.welcome_dismissed_at` server-side so the card never shows
 * again for this user. Optimistically hides on click so the dismissal
 * feels instant even if the roundtrip stalls.
 *
 * Not a route — the parent layout only mounts this when the server
 * decides the user hasn't dismissed yet. No client-side poll, no
 * rehydration loop.
 */
export function WelcomeOverlay({ content }: { content: WelcomeContent }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  function dismiss() {
    setHidden(true);
    startTransition(() => {
      // Fire-and-forget — the server stamps the column and revalidates
      // the layout; next render the parent won't mount the overlay.
      void dismissWelcome();
    });
  }

  if (hidden) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={content.title}
      data-testid="welcome-overlay"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:inset-x-auto sm:right-4 sm:bottom-4"
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-surface ring-1 ring-border shadow-lg shadow-black/5">
        <div className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-sm font-semibold text-fg">{content.title}</h2>
            <p className="text-xs text-fg-muted leading-relaxed">
              {content.body}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            aria-label="Close welcome"
            data-testid="welcome-close"
            className="rounded-sm p-1 text-fg-subtle hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
          <Button
            type="button"
            size="sm"
            onClick={dismiss}
            disabled={pending}
            data-testid="welcome-dismiss"
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
