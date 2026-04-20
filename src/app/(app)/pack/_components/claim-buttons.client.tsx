"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Hand, HandMetal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  claimOrder,
  releaseOrder,
  type ClaimFormState,
} from "@/lib/actions/pack-claim";

/**
 * Phase 8 — claim/release buttons for a single pack-queue row.
 *
 * Three visible states:
 *   - UNCLAIMED       → "Claim" button
 *   - CLAIMED BY ME   → "Release" button
 *   - CLAIMED BY OTHER→ read-only label; admin gets "Override release"
 *
 * The server actions revalidate `/pack` so on success the parent
 * Server Component re-renders with the new claim state.
 */
export function ClaimButtons({
  orderId,
  orderNumber,
  mine,
  claimedByEmail,
  isAdmin,
}: {
  orderId: string;
  orderNumber: string;
  mine: boolean;
  claimedByEmail: string | null;
  isAdmin: boolean;
}) {
  if (mine) {
    return (
      <ReleaseButton
        orderId={orderId}
        variant="mine"
        label={`Release ${orderNumber}`}
      />
    );
  }
  if (claimedByEmail) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-fg-muted"
          data-claimed-by={claimedByEmail}
        >
          Claimed by{" "}
          <span className="text-fg" data-testid={`claimed-by-${orderNumber}`}>
            {claimedByEmail}
          </span>
        </span>
        {isAdmin ? (
          <ReleaseButton
            orderId={orderId}
            variant="admin-override"
            label={`Admin release ${orderNumber}`}
          />
        ) : null}
      </div>
    );
  }
  return <ClaimButton orderId={orderId} label={`Claim ${orderNumber}`} />;
}

function ClaimButton({
  orderId,
  label,
}: {
  orderId: string;
  label: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState<ClaimFormState, FormData>(
    claimOrder,
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
    <form action={action}>
      <input type="hidden" name="id" value={orderId} />
      <SubmitBtn label={label} variant="claim" />
      {state && "error" in state && state.error ? (
        <span role="alert" className="ml-2 text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function ReleaseButton({
  orderId,
  variant,
  label,
}: {
  orderId: string;
  variant: "mine" | "admin-override";
  label: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState<ClaimFormState, FormData>(
    releaseOrder,
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
    <form action={action}>
      <input type="hidden" name="id" value={orderId} />
      <SubmitBtn label={label} variant={variant} />
      {state && "error" in state && state.error ? (
        <span role="alert" className="ml-2 text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SubmitBtn({
  label,
  variant,
}: {
  label: string;
  variant: "claim" | "mine" | "admin-override";
}) {
  const { pending } = useFormStatus();
  if (variant === "claim") {
    return (
      <Button type="submit" size="sm" loading={pending} aria-label={label}>
        <Hand className="h-3.5 w-3.5" />
        Claim
      </Button>
    );
  }
  if (variant === "mine") {
    return (
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={pending}
        aria-label={label}
      >
        <HandMetal className="h-3.5 w-3.5" />
        Release
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      loading={pending}
      aria-label={label}
    >
      Override
    </Button>
  );
}
