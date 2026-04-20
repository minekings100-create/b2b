"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TableCell,
  TableRow,
  TableRowActions,
} from "@/components/ui/table";
import {
  deleteHoliday,
  updateHoliday,
  type HolidayFormState,
} from "@/lib/actions/public-holidays";

export type HolidayRowData = {
  id: string;
  region: string;
  date: string;
  name: string;
};

export function HolidayRow({ row }: { row: HolidayRowData }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  if (mode === "edit") {
    return <EditRow row={row} onDone={() => setMode("view")} />;
  }
  if (mode === "confirm-delete") {
    return <DeleteRow row={row} onCancel={() => setMode("view")} />;
  }
  return (
    <ViewRow
      row={row}
      onEdit={() => setMode("edit")}
      onDelete={() => setMode("confirm-delete")}
    />
  );
}

function ViewRow({
  row,
  onEdit,
  onDelete,
}: {
  row: HolidayRowData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-numeric">{row.date}</TableCell>
      <TableCell className="text-fg-muted">{row.region}</TableCell>
      <TableCell className="font-medium">{row.name}</TableCell>
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
            aria-label={`Delete ${row.name}`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TableRowActions>
      </TableCell>
    </TableRow>
  );
}

function EditRow({
  row,
  onDone,
}: {
  row: HolidayRowData;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState<HolidayFormState, FormData>(
    updateHoliday,
    undefined,
  );
  const fieldErrors =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

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
          <div className="w-[140px]">
            <Input
              name="date"
              type="date"
              defaultValue={row.date}
              required
              className="font-numeric"
              aria-label="Date"
              invalid={Boolean(fieldErrors.date)}
            />
          </div>
          <div className="w-[80px]">
            <Input
              name="region"
              defaultValue={row.region}
              maxLength={8}
              className="uppercase"
              aria-label="Region"
              invalid={Boolean(fieldErrors.region)}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Input
              name="name"
              defaultValue={row.name}
              required
              aria-label="Name"
              autoFocus
              invalid={Boolean(fieldErrors.name)}
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

function DeleteRow({
  row,
  onCancel,
}: {
  row: HolidayRowData;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState<HolidayFormState, FormData>(
    deleteHoliday,
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
            Delete <span className="font-medium">{row.name}</span> (
            <span className="font-numeric">{row.date}</span>)?
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" variant="danger" size="sm">
              Confirm delete
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
