"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deactivateLogin,
  reactivateLogin,
  triggerPasswordReset,
  type UserFormState,
} from "@/lib/actions/user-lifecycle";

export function PasswordResetButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    triggerPasswordReset,
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
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={userId} />
      <SubmitBtn label={`Send password reset to ${email}`}>
        <KeyRound className="h-3.5 w-3.5" />
        Send password reset
      </SubmitBtn>
      {state && "success" in state ? (
        <span className="text-[11px] text-success">
          Reset email sent.
        </span>
      ) : null}
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function DeactivateToggle({
  userId,
  email,
  loginDisabled,
}: {
  userId: string;
  email: string;
  loginDisabled: boolean;
}) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    loginDisabled ? reactivateLogin : deactivateLogin,
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
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={userId} />
      {loginDisabled ? (
        <SubmitBtn
          label={`Re-enable login for ${email}`}
          variant="secondary"
        >
          <Unlock className="h-3.5 w-3.5" />
          Re-enable login
        </SubmitBtn>
      ) : (
        <SubmitBtn
          label={`Disable login for ${email}`}
          variant="danger"
        >
          <Lock className="h-3.5 w-3.5" />
          Disable login
        </SubmitBtn>
      )}
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SubmitBtn({
  label,
  variant,
  children,
}: {
  label: string;
  variant?: "secondary" | "danger";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      loading={pending}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
