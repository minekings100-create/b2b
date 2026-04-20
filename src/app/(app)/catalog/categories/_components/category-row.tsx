"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Check, Pencil, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TableCell,
  TableRow,
  TableRowActions,
} from "@/components/ui/table";
import { ArchivedBadge } from "@/components/app/archived-primitives";
import {
  archiveCategory,
  restoreCategory,
  updateCategory,
  type CategoryFormState,
} from "@/lib/actions/categories";

export type CategoryRowData = {
  id: string;
  name: string;
  sort_order: number;
  product_count: number;
  archived: boolean;
};

export function CategoryRow({ row }: { row: CategoryRowData }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-archive">("view");

  if (row.archived) {
    return <ArchivedViewRow row={row} />;
  }
  if (mode === "edit") {
    return <EditRow row={row} onDone={() => setMode("view")} />;
  }
  if (mode === "confirm-archive") {
    return <ArchiveRow row={row} onCancel={() => setMode("view")} />;
  }
  return <ViewRow row={row} onEdit={() => setMode("edit")} onArchive={() => setMode("confirm-archive")} />;
}

function ArchivedViewRow({ row }: { row: CategoryRowData }) {
  const router = useRouter();
  const [state, action] = useFormState<CategoryFormState, FormData>(
    restoreCategory,
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
    <TableRow className="opacity-60">
      <TableCell numeric className="text-fg-muted">
        {row.sort_order}
      </TableCell>
      <TableCell className="font-medium">
        {row.name}
        <ArchivedBadge />
      </TableCell>
      <TableCell numeric className="text-fg-muted">
        {row.product_count}
      </TableCell>
      <TableCell>
        <TableRowActions>
          <form action={action}>
            <input type="hidden" name="id" value={row.id} />
            <RestoreBtn label={`Restore ${row.name}`} />
          </form>
        </TableRowActions>
        {state && "error" in state && state.error ? (
          <span role="alert" className="block text-[11px] text-danger">
            {state.error}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RestoreBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} aria-label={label}>
      <ArchiveRestore className="h-3.5 w-3.5" />
      Restore
    </Button>
  );
}

function ViewRow({
  row,
  onEdit,
  onArchive,
}: {
  row: CategoryRowData;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <TableRow>
      <TableCell numeric className="text-fg-muted">
        {row.sort_order}
      </TableCell>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell numeric className="text-fg-muted">
        {row.product_count}
      </TableCell>
      <TableCell>
        <TableRowActions>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit ${row.name}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Archive ${row.name}`}
            onClick={onArchive}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TableRowActions>
      </TableCell>
    </TableRow>
  );
}

function EditRow({ row, onDone }: { row: CategoryRowData; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useFormState<CategoryFormState, FormData>(
    updateCategory,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  // On success: refresh the server component + close the edit row. Guarded
  // by a ref so we don't bounce through this effect on every re-render.
  const closed = useRef(false);
  useEffect(() => {
    if (state && "success" in state && !closed.current) {
      closed.current = true;
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <TableRow>
      <TableCell colSpan={4}>
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={row.id} />
          <div className="w-[80px]">
            <Input
              name="sort_order"
              type="number"
              min={0}
              step={1}
              defaultValue={row.sort_order}
              className="font-numeric"
              aria-label="Sort order"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Input
              name="name"
              defaultValue={row.name}
              required
              invalid={Boolean(fieldErrors.name)}
              aria-label="Name"
              autoFocus
            />
          </div>
          <SaveBtn />
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          {state && "error" in state && state.error ? (
            <span role="alert" className="ml-2 text-xs text-danger">
              {state.error}
            </span>
          ) : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

function ArchiveRow({
  row,
  onCancel,
}: {
  row: CategoryRowData;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState<CategoryFormState, FormData>(
    archiveCategory,
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
    <TableRow>
      <TableCell colSpan={4}>
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <span className="text-sm text-fg">
            Archive <span className="font-medium">{row.name}</span>?
          </span>
          {row.product_count > 0 ? (
            <span className="text-xs text-warning-subtle-fg">
              ({row.product_count} product
              {row.product_count === 1 ? "" : "s"} keep a reference to it)
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" variant="danger" size="sm">
              Confirm archive
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {state && "error" in state && state.error ? (
            <span role="alert" className="text-xs text-danger">
              {state.error}
            </span>
          ) : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      <Check className="h-3.5 w-3.5" />
      Save
    </Button>
  );
}
