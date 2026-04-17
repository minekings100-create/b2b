"use client";

import { useFormState } from "react-dom";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveProduct, type FormState } from "@/lib/actions/catalog";

export function ArchiveSection({ id }: { id: string }) {
  const [state, action] = useFormState<FormState, FormData>(
    archiveProduct,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="rounded-lg ring-1 ring-danger/30 bg-danger-subtle/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-danger-subtle-fg">
        Danger zone
      </p>
      <p className="mt-1 text-sm text-fg">
        Archiving a product hides it from the catalog. History is kept.
      </p>

      {!confirming ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Archive product
        </Button>
      ) : (
        <form action={action} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="danger" size="sm">
            Confirm archive
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          {state && "error" in state && state.error ? (
            <span className="text-xs text-danger" role="alert">
              {state.error}
            </span>
          ) : null}
        </form>
      )}
    </section>
  );
}
