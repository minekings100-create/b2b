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
  archiveBranch,
  restoreBranch,
  type BranchFormState,
} from "@/lib/actions/branches";

export type BranchRowData = {
  id: string;
  branch_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  archived: boolean;
};

export function BranchRow({ row }: { row: BranchRowData }) {
  if (row.archived) return <RestoreRow row={row} />;
  return <ActiveRow row={row} />;
}

function ActiveRow({ row }: { row: BranchRowData }) {
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const [state, action] = useFormState<BranchFormState, FormData>(
    archiveBranch,
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
      <TableCell className="font-numeric text-fg-muted">{row.branch_code}</TableCell>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="hidden md:table-cell text-fg-muted">
        {row.email ?? "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-fg-muted">
        {row.phone ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {confirm ? (
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
              aria-label={`Archive ${row.name}`}
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

function RestoreRow({ row }: { row: BranchRowData }) {
  const router = useRouter();
  const [state, action] = useFormState<BranchFormState, FormData>(
    restoreBranch,
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
      <TableCell className="font-numeric text-fg-muted">{row.branch_code}</TableCell>
      <TableCell className="font-medium">
        {row.name}
        <ArchivedBadge />
      </TableCell>
      <TableCell className="hidden md:table-cell text-fg-muted">
        {row.email ?? "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-fg-muted">
        {row.phone ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        <form action={action}>
          <input type="hidden" name="id" value={row.id} />
          <RestoreBtn label={`Restore ${row.name}`} />
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
