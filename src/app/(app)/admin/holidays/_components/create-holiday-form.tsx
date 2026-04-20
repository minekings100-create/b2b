"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  createHoliday,
  type HolidayFormState,
} from "@/lib/actions/public-holidays";

export function CreateHolidayForm() {
  const router = useRouter();
  const [state, action] = useFormState<HolidayFormState, FormData>(
    createHoliday,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  const lastOkId = useRef<string | null>(null);
  useEffect(() => {
    if (
      state &&
      "success" in state &&
      state.id &&
      state.id !== lastOkId.current
    ) {
      lastOkId.current = state.id;
      router.refresh();
    }
  }, [state, router]);

  const formKey =
    state && "success" in state ? `ok-${state.id ?? Math.random()}` : "idle";

  return (
    <form
      key={formKey}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4 ring-1 ring-border"
    >
      <div className="w-[140px]">
        <Label htmlFor="hol-date">Date</Label>
        <Input
          id="hol-date"
          name="date"
          type="date"
          required
          className="mt-1.5 font-numeric"
          invalid={Boolean(fieldErrors.date)}
        />
      </div>
      <div className="w-[80px]">
        <Label htmlFor="hol-region">Region</Label>
        <Input
          id="hol-region"
          name="region"
          defaultValue="NL"
          maxLength={8}
          className="mt-1.5 uppercase"
          invalid={Boolean(fieldErrors.region)}
        />
      </div>
      <div className="min-w-[220px] flex-1">
        <Label htmlFor="hol-name">Name</Label>
        <Input
          id="hol-name"
          name="name"
          placeholder="e.g. Koningsdag"
          required
          className="mt-1.5"
          invalid={Boolean(fieldErrors.name)}
        />
      </div>
      <SubmitBtn />
      {state && "error" in state && state.error ? (
        <p role="alert" className="ml-auto text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Plus className="h-3.5 w-3.5" />
      Add holiday
    </Button>
  );
}
