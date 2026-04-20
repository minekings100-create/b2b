"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUser, type UserFormState } from "@/lib/actions/user-lifecycle";
import { USER_ROLE_VALUES } from "@/lib/validation/user-lifecycle";

type Branch = { id: string; branch_code: string; name: string };

type Row = {
  key: string;
  role: (typeof USER_ROLE_VALUES)[number];
  branch_id: string;
};

const GLOBAL_ROLES = new Set<Row["role"]>([
  "packer",
  "hq_operations_manager",
  "administration",
  "super_admin",
]);

export function InviteUserForm({
  branches,
  canGrantSuperAdmin,
}: {
  branches: Branch[];
  canGrantSuperAdmin: boolean;
}) {
  const [state, action] = useFormState<UserFormState, FormData>(
    inviteUser,
    undefined,
  );
  const [rows, setRows] = useState<Row[]>([
    { key: "1", role: "branch_user", branch_id: branches[0]?.id ?? "" },
  ]);

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        key: String(Math.random()),
        role: "branch_user",
        branch_id: branches[0]?.id ?? "",
      },
    ]);
  const removeRow = (key: string) =>
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((r) => r.key !== key),
    );
  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  return (
    <form
      action={action}
      className="max-w-2xl space-y-6 rounded-lg bg-surface p-5 ring-1 ring-border"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="iu-email">Email</Label>
          <Input
            id="iu-email"
            name="email"
            type="email"
            required
            className="mt-1.5"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="iu-name">Full name</Label>
          <Input
            id="iu-name"
            name="full_name"
            required
            className="mt-1.5"
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-fg">
          Role assignments
        </legend>
        {rows.map((r) => {
          const isGlobal = GLOBAL_ROLES.has(r.role);
          return (
            <div
              key={r.key}
              className="flex flex-wrap items-end gap-3 rounded-md ring-1 ring-border p-3"
            >
              <div className="min-w-[200px] flex-1">
                <Label htmlFor={`iu-role-${r.key}`}>Role</Label>
                <select
                  id={`iu-role-${r.key}`}
                  name="assignments_role"
                  value={r.role}
                  onChange={(e) =>
                    updateRow(r.key, {
                      role: e.target.value as Row["role"],
                    })
                  }
                  className="mt-1.5 block h-9 w-full rounded-md bg-surface px-2 text-sm ring-1 ring-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                >
                  {USER_ROLE_VALUES.filter(
                    (role) => canGrantSuperAdmin || role !== "super_admin",
                  ).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[200px] flex-1">
                <Label htmlFor={`iu-branch-${r.key}`}>
                  Branch {isGlobal ? "(n/a — global role)" : ""}
                </Label>
                <select
                  id={`iu-branch-${r.key}`}
                  name="assignments_branch_id"
                  value={isGlobal ? "" : r.branch_id}
                  onChange={(e) =>
                    updateRow(r.key, { branch_id: e.target.value })
                  }
                  disabled={isGlobal}
                  className="mt-1.5 block h-9 w-full rounded-md bg-surface px-2 text-sm ring-1 ring-border disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                >
                  <option value="">(none)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove assignment"
                onClick={() => removeRow(r.key)}
                disabled={rows.length === 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRow}
          data-testid="add-role-row"
        >
          <Plus className="h-3.5 w-3.5" />
          Add another assignment
        </Button>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {state && "error" in state && state.error ? (
          <span role="alert" className="text-xs text-danger">
            {state.error}
          </span>
        ) : null}
        <SubmitBtn />
      </div>
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} data-testid="invite-submit">
      Send invite
    </Button>
  );
}
