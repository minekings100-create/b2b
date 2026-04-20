"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateUserProfile,
  type UserFormState,
} from "@/lib/actions/user-lifecycle";

export function ProfileForm({
  userId,
  initialFullName,
  email,
}: {
  userId: string;
  initialFullName: string;
  email: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    updateUserProfile,
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
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4 ring-1 ring-border"
    >
      <input type="hidden" name="id" value={userId} />
      <div className="min-w-[220px] flex-1">
        <Label htmlFor="pf-name">Full name</Label>
        <Input
          id="pf-name"
          name="full_name"
          defaultValue={initialFullName}
          required
          className="mt-1.5"
        />
      </div>
      <div className="min-w-[220px] flex-1">
        <Label htmlFor="pf-email">Email (managed by Supabase Auth)</Label>
        <Input
          id="pf-email"
          defaultValue={email}
          disabled
          className="mt-1.5"
        />
      </div>
      <SaveBtn />
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Save profile
    </Button>
  );
}
