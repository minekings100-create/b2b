"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  addRole,
  removeRole,
  type UserFormState,
} from "@/lib/actions/user-lifecycle";
import { USER_ROLE_VALUES } from "@/lib/validation/user-lifecycle";

type Branch = { id: string; branch_code: string; name: string };
type Assignment = {
  id: string;
  role: (typeof USER_ROLE_VALUES)[number];
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
};

const GLOBAL_ROLES = new Set<Assignment["role"]>([
  "packer",
  "hq_operations_manager",
  "administration",
  "super_admin",
]);

export function RoleAssignmentsEditor({
  userId,
  branches,
  assignments,
  canGrantSuperAdmin,
}: {
  userId: string;
  branches: Branch[];
  assignments: Assignment[];
  canGrantSuperAdmin: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-surface p-4 ring-1 ring-border">
      {assignments.length === 0 ? (
        <p className="text-sm text-fg-muted">No active assignments.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-md bg-bg px-3 py-2 ring-1 ring-border"
            >
              <span className="text-sm font-medium text-fg">{a.role}</span>
              <span className="text-xs text-fg-muted">
                {a.branch_id
                  ? `${a.branch_code} — ${a.branch_name}`
                  : "global"}
              </span>
              <div className="ml-auto">
                <RemoveRoleButton
                  roleRowId={a.id}
                  labelSuffix={`${a.role} ${a.branch_code ?? ""}`.trim()}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddRoleRow
        userId={userId}
        branches={branches}
        canGrantSuperAdmin={canGrantSuperAdmin}
      />
    </div>
  );
}

function AddRoleRow({
  userId,
  branches,
  canGrantSuperAdmin,
}: {
  userId: string;
  branches: Branch[];
  canGrantSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    addRole,
    undefined,
  );
  const [role, setRole] = useState<Assignment["role"]>("branch_user");
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const isGlobal = GLOBAL_ROLES.has(role);

  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !("success" in state)) return;
    const k = `${role}:${branchId}`;
    if (k === lastKey.current) return;
    lastKey.current = k;
    router.refresh();
  }, [state, router, role, branchId]);

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-md ring-1 ring-border p-3"
    >
      <input type="hidden" name="user_id" value={userId} />
      <div className="min-w-[200px] flex-1">
        <Label htmlFor="ar-role">Role</Label>
        <select
          id="ar-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Assignment["role"])}
          className="mt-1.5 block h-9 w-full rounded-md bg-surface px-2 text-sm ring-1 ring-border"
        >
          {USER_ROLE_VALUES.filter(
            (r) => canGrantSuperAdmin || r !== "super_admin",
          ).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[200px] flex-1">
        <Label htmlFor="ar-branch">
          Branch {isGlobal ? "(n/a)" : ""}
        </Label>
        <select
          id="ar-branch"
          name="branch_id"
          value={isGlobal ? "" : branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={isGlobal}
          className="mt-1.5 block h-9 w-full rounded-md bg-surface px-2 text-sm ring-1 ring-border disabled:opacity-50"
        >
          <option value="">(none)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branch_code} — {b.name}
            </option>
          ))}
        </select>
      </div>
      <AddBtn />
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function AddBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending} data-testid="add-role">
      <Plus className="h-3.5 w-3.5" />
      Add role
    </Button>
  );
}

function RemoveRoleButton({
  roleRowId,
  labelSuffix,
}: {
  roleRowId: string;
  labelSuffix: string;
}) {
  const router = useRouter();
  const [state, action] = useFormState<UserFormState, FormData>(
    removeRole,
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
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="role_row_id" value={roleRowId} />
      <RemoveBtn label={`Remove ${labelSuffix}`} />
      {state && "error" in state && state.error ? (
        <span role="alert" className="text-[11px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function RemoveBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      aria-label={label}
      loading={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
