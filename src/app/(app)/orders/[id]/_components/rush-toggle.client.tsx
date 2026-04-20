"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Zap, ZapOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setRush, type RushFormState } from "@/lib/actions/pack-rush";

/**
 * Phase 8 — rush toggle for HQ / admin on the order detail page.
 *
 * Sets or clears `orders.is_rush`. Creator-at-submit flow uses the
 * checkbox in the cart submit form (separate client component) — this
 * toggle is the post-submit surface.
 */
export function RushToggle({
  orderId,
  orderNumber,
  isRush,
}: {
  orderId: string;
  orderNumber: string;
  isRush: boolean;
}) {
  const router = useRouter();
  const [state, action] = useFormState<RushFormState, FormData>(
    setRush,
    undefined,
  );
  const refreshed = useRef(false);
  useEffect(() => {
    if (state && "success" in state && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <input
        type="hidden"
        name="is_rush"
        value={isRush ? "false" : "true"}
      />
      <SubmitBtn
        isRush={isRush}
        label={
          isRush
            ? `Clear rush on ${orderNumber}`
            : `Mark ${orderNumber} as rush`
        }
      />
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SubmitBtn({
  isRush,
  label,
}: {
  isRush: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  if (isRush) {
    return (
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        loading={pending}
        aria-label={label}
        data-testid="rush-toggle"
      >
        <ZapOff className="h-3.5 w-3.5" />
        Clear rush
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      size="sm"
      variant="secondary"
      loading={pending}
      aria-label={label}
      data-testid="rush-toggle"
    >
      <Zap className="h-3.5 w-3.5" />
      Mark rush
    </Button>
  );
}
