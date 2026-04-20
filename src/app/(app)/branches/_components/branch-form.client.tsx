"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBranch,
  updateBranch,
  type BranchFormState,
} from "@/lib/actions/branch-lifecycle";

type BranchFields = {
  id?: string;
  name: string;
  branch_code: string;
  email: string | null;
  phone: string | null;
  visiting_address: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  iban: string | null;
  monthly_budget_cents: number | null;
  payment_term_days: number;
};

export function BranchForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: BranchFields;
}) {
  const router = useRouter();
  const [state, action] = useFormState<BranchFormState, FormData>(
    mode === "create" ? createBranch : updateBranch,
    undefined,
  );
  const refreshed = useRef(false);
  useEffect(() => {
    if (mode === "edit" && state && "success" in state && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state, router, mode]);

  const errs =
    state && "fieldErrors" in state && state.fieldErrors
      ? state.fieldErrors
      : {};

  return (
    <form
      action={action}
      className="max-w-3xl space-y-5 rounded-lg bg-surface p-5 ring-1 ring-border"
    >
      {mode === "edit" && initial ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="br-name">Name</Label>
          <Input
            id="br-name"
            name="name"
            required
            defaultValue={initial?.name ?? ""}
            className="mt-1.5"
            invalid={Boolean(errs.name)}
          />
        </div>
        <div>
          <Label htmlFor="br-code">Branch code</Label>
          <Input
            id="br-code"
            name="branch_code"
            required
            defaultValue={initial?.branch_code ?? ""}
            className="mt-1.5 uppercase font-numeric"
            autoComplete="off"
            invalid={Boolean(errs.branch_code)}
          />
        </div>
        <div>
          <Label htmlFor="br-email">Email</Label>
          <Input
            id="br-email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="br-phone">Phone</Label>
          <Input
            id="br-phone"
            name="phone"
            defaultValue={initial?.phone ?? ""}
            className="mt-1.5"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="br-vis">Visiting address</Label>
          <Input
            id="br-vis"
            name="visiting_address"
            defaultValue={initial?.visiting_address ?? ""}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="br-bil">Billing address</Label>
          <Input
            id="br-bil"
            name="billing_address"
            defaultValue={initial?.billing_address ?? ""}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="br-shi">Shipping address</Label>
          <Input
            id="br-shi"
            name="shipping_address"
            defaultValue={initial?.shipping_address ?? ""}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="br-kvk">KvK number</Label>
          <Input
            id="br-kvk"
            name="kvk_number"
            defaultValue={initial?.kvk_number ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div>
          <Label htmlFor="br-vat">VAT number</Label>
          <Input
            id="br-vat"
            name="vat_number"
            defaultValue={initial?.vat_number ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div>
          <Label htmlFor="br-iban">IBAN</Label>
          <Input
            id="br-iban"
            name="iban"
            defaultValue={initial?.iban ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div>
          <Label htmlFor="br-budget">Monthly budget (cents)</Label>
          <Input
            id="br-budget"
            name="monthly_budget_cents"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.monthly_budget_cents ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div>
          <Label htmlFor="br-terms">Payment term (days)</Label>
          <Input
            id="br-terms"
            name="payment_term_days"
            type="number"
            min={0}
            max={365}
            step={1}
            defaultValue={initial?.payment_term_days ?? 14}
            className="mt-1.5 font-numeric"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {state && "error" in state && state.error ? (
          <span role="alert" className="text-xs text-danger">
            {state.error}
          </span>
        ) : null}
        <SubmitBtn mode={mode} />
      </div>
    </form>
  );
}

function SubmitBtn({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} data-testid="branch-submit">
      {mode === "create" ? "Create branch" : "Save changes"}
    </Button>
  );
}
