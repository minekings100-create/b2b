"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  createCategory,
  type CategoryFormState,
} from "@/lib/actions/categories";

export function CreateCategoryForm() {
  const router = useRouter();
  const [state, action] = useFormState<CategoryFormState, FormData>(
    createCategory,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  // Refresh the server component on success so the new row appears in the
  // table. `revalidatePath` alone doesn't re-render the visible tree —
  // router.refresh re-fetches the RSC payload for the current route.
  const lastOkId = useRef<string | null>(null);
  useEffect(() => {
    if (state && "success" in state && state.id && state.id !== lastOkId.current) {
      lastOkId.current = state.id;
      router.refresh();
    }
  }, [state, router]);

  // Reset the form after a successful submit so admins can add another
  // without manually clearing inputs.
  const formKey =
    state && "success" in state ? `ok-${state.id ?? Math.random()}` : "idle";

  return (
    <form
      key={formKey}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg bg-surface ring-1 ring-border p-4"
    >
      <div className="w-[100px]">
        <Label htmlFor="cat-sort">Order</Label>
        <Input
          id="cat-sort"
          name="sort_order"
          type="number"
          min={0}
          step={10}
          defaultValue={0}
          className="mt-1.5 font-numeric"
          invalid={Boolean(fieldErrors.sort_order)}
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="cat-name">Name</Label>
        <Input
          id="cat-name"
          name="name"
          placeholder="e.g. Hygiene supplies"
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
      Add category
    </Button>
  );
}
