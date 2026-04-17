"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithMagicLink,
  signInWithPassword,
  type FormState,
} from "./actions";

function SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant ?? "primary"}
      loading={pending}
      className="w-full"
    >
      {children}
    </Button>
  );
}

export default function LoginPage() {
  const [pwState, pwAction] = useFormState<FormState, FormData>(
    signInWithPassword,
    undefined,
  );
  const [mlState, mlAction] = useFormState<FormState, FormData>(
    signInWithMagicLink,
    undefined,
  );

  return (
    <div className="space-y-6">
      <form action={pwAction} className="space-y-3" aria-label="Credentials sign-in">
        <div className="space-y-1.5">
          <Label htmlFor="pw-email">Email</Label>
          <Input
            id="pw-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-password">Password</Label>
          <Input
            id="pw-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </div>
        {pwState?.error ? (
          <p className="text-xs text-danger" role="alert">
            {pwState.error}
          </p>
        ) : null}
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="label-meta">or</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      <form action={mlAction} className="space-y-3" aria-label="Magic link sign-in">
        <div className="space-y-1.5">
          <Label htmlFor="ml-email">Email</Label>
          <Input
            id="ml-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        {mlState?.error ? (
          <p className="text-xs text-danger" role="alert">
            {mlState.error}
          </p>
        ) : null}
        {mlState?.success ? (
          <p className="text-xs text-success-subtle-fg" role="status">
            {mlState.success}
          </p>
        ) : null}
        <SubmitButton variant="secondary">Send magic link</SubmitButton>
      </form>
    </div>
  );
}
