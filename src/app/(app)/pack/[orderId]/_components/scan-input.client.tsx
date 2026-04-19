"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, ScanBarcode } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  manualPack,
  scanBarcode,
  type PackActionState,
} from "@/lib/actions/packing";

/**
 * Phase 4 — auto-focused scan input.
 *
 * Sits at the top of the pick page; permanently auto-focused (SPEC §4)
 * so the packer's scanner gun lands its keystrokes here without an
 * extra click. After every successful scan the input clears and
 * re-focuses. Over-pack returns `needs_confirm` from the action — we
 * surface a small inline confirm strip and re-submit on accept.
 */
export function ScanInput({
  orderId,
  inputId = "scan-input",
}: {
  orderId: string;
  inputId?: string;
}) {
  const [state, action] = useFormState<PackActionState, FormData>(
    scanBarcode,
    undefined,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus on mount + after every server action settles.
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  React.useEffect(() => {
    if (state?.ok === true) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  const showConfirm =
    state && !state.ok && state.needs_confirm !== undefined;

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <Input
            ref={inputRef}
            id={inputId}
            name="barcode"
            placeholder="Scan or type a barcode and press Enter"
            autoComplete="off"
            autoFocus
            data-testid="scan-input"
            className="h-16 pl-11 text-base"
          />
        </div>
        <SubmitButton />
      </div>
      {state && !state.ok && !showConfirm ? (
        <p
          className="text-sm text-danger"
          role="alert"
          data-testid="scan-error"
        >
          {state.error}
        </p>
      ) : null}
      {showConfirm ? (
        <ConfirmOverpack
          orderId={orderId}
          orderItemId={state.needs_confirm!.order_item_id}
          delta={state.needs_confirm!.delta}
          overpackBy={state.needs_confirm!.overpack_by}
        />
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      className="h-16 px-6"
      loading={pending}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan"}
    </Button>
  );
}

/**
 * Inline confirm strip for over-pack. Re-targets to `manualPack`
 * (we already know the line + delta from the failed scan) with
 * `force=true`. Auto-focuses the confirm button so an Enter on the
 * scanner keeps the flow keyboard-driven.
 */
function ConfirmOverpack({
  orderId,
  orderItemId,
  delta,
  overpackBy,
}: {
  orderId: string;
  orderItemId: string;
  delta: number;
  overpackBy: number;
}) {
  const [, action] = useFormState<PackActionState, FormData>(
    manualPack,
    undefined,
  );
  return (
    <form
      action={action}
      className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-fg"
      data-testid="scan-overpack-confirm"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="order_item_id" value={orderItemId} />
      <input type="hidden" name="quantity" value={delta} />
      <input type="hidden" name="force" value="true" />
      <span className="flex-1">
        Over-pack by {overpackBy}. Confirm?
      </span>
      <Button type="submit" variant="primary" size="sm" autoFocus>
        Confirm over-pack
      </Button>
    </form>
  );
}
