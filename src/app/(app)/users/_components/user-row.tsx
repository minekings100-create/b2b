"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TableCell,
  TableRow,
  TableRowActions,
} from "@/components/ui/table";
import { ArchivedBadge } from "@/components/app/archived-primitives";
import {
  archiveUser,
  restoreUser,
  type UserFormState,
} from "@/lib/actions/users";

export type UserRowData = {
  id: string;
  email: string;
  full_name: string | null;
  roles: readonly string[];
  archived: boolean;
  is_self: boolean;
};

export function UserRow({ row }: { row: UserRowData }) {
  if (row.archived) return <RestoreRow row={row} />;
  return <ActiveRow row={row} />;
}

function ActiveRow({ row }: { row: UserRowData }) {
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    archiveUser,
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
      <TableCell className="font-medium">{row.email}</TableCell>
      <TableCell className="hidden md:table-cell text-fg-muted">
        {row.full_name ?? "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-fg-muted text-xs">
        {row.roles.length === 0 ? "—" : row.roles.join(", ")}
      </TableCell>
      <TableCell className="text-right">
        {row.is_self ? (
          <span className="text-[11px] text-fg-subtle">This is you</span>
        ) : confirm ? (
          <form action={action} className="flex items-center justify-end gap-2">
            <input type="hidden" name="id" value={row.id} />
            <span className="text-xs text-fg-muted">Archive?</span>
            <ConfirmBtn />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <TableRowActions>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Archive ${row.email}`}
              onClick={() => setConfirm(true)}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </TableRowActions>
        )}
        {state && "error" in state && state.error ? (
          <span role="alert" className="block text-[11px] text-danger">
            {state.error}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RestoreRow({ row }: { row: UserRowData }) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    restoreUser,
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
      <TableCell className="font-medium">
        {row.email}
        <ArchivedBadge />
      </TableCell>
      <TableCell className="hidden md:table-cell text-fg-muted">
        {row.full_name ?? "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-fg-muted text-xs">
        {row.roles.length === 0 ? "—" : row.roles.join(", ")}
      </TableCell>
      <TableCell className="text-right">
        <form action={action}>
          <input type="hidden" name="id" value={row.id} />
          <RestoreBtn label={`Restore ${row.email}`} />
        </form>
        {state && "error" in state && state.error ? (
          <span role="alert" className="block text-[11px] text-danger">
            {state.error}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function ConfirmBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" loading={pending}>
      Confirm
    </Button>
  );
}

function RestoreBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      loading={pending}
      aria-label={label}
    >
      <ArchiveRestore className="h-3.5 w-3.5" />
      Restore
    </Button>
  );
}
