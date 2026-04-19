"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import {
  type OrderEditHistoryEntry,
  type OrderEditHistoryLineSnapshot,
} from "@/lib/db/order-edit-history";

/**
 * Phase 3.4 — `<OrderEditHistory>` diff viewer.
 *
 * Collapsible section rendered below the activity timeline on
 * `/orders/[id]`. One row per `order_edit_history` entry. Expanding a
 * row shows a two-column diff (Before | After) — removed lines
 * strikethrough red, added lines green, quantity changes `old → new`.
 *
 * Pure client component — no fetching. Parent passes the loaded
 * entries; RLS has already filtered them.
 */
export function OrderEditHistory({
  entries,
  totalEdits,
}: {
  entries: OrderEditHistoryEntry[];
  totalEdits: number;
}) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="space-y-3" data-testid="order-edit-history">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-fg-muted" aria-hidden />
        <h2 className="text-base font-semibold tracking-tight">
          Edit history ({totalEdits} edit{totalEdits === 1 ? "" : "s"})
        </h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No readable edits. Your role may not see the full history for this
          order.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg ring-1 ring-border">
          {entries.map((entry) => {
            const open = openIds.has(entry.id);
            return (
              <li key={entry.id} data-testid="edit-history-entry">
                <button
                  type="button"
                  onClick={() => toggle(entry.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left transition-colors",
                    "hover:bg-surface-elevated",
                    open && "bg-surface-elevated",
                  )}
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2">
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-fg-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-fg-muted" />
                    )}
                    <span className="text-sm text-fg">
                      {entry.edited_by_email ?? "Unknown actor"}
                    </span>
                  </span>
                  <span className="font-numeric text-xs text-fg-muted">
                    {new Date(entry.edited_at).toLocaleString("nl-NL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Amsterdam",
                    })}
                  </span>
                </button>
                {open ? <Diff entry={entry} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Diff({ entry }: { entry: OrderEditHistoryEntry }) {
  // Align by product_id so quantity changes line up across columns.
  const beforeByProduct = new Map(
    entry.before_items.map((i) => [i.product_id, i] as const),
  );
  const afterByProduct = new Map(
    entry.after_items.map((i) => [i.product_id, i] as const),
  );
  const allProductIds = Array.from(
    new Set([...beforeByProduct.keys(), ...afterByProduct.keys()]),
  );

  const rows = allProductIds
    .map((pid) => {
      const before = beforeByProduct.get(pid) ?? null;
      const after = afterByProduct.get(pid) ?? null;
      const kind =
        before && !after
          ? ("removed" as const)
          : !before && after
            ? ("added" as const)
            : before && after && before.quantity_requested !== after.quantity_requested
              ? ("changed" as const)
              : ("unchanged" as const);
      return { pid, before, after, kind };
    })
    // Show changed rows first, then added, then removed, then unchanged.
    .sort((a, b) => {
      const rank = { changed: 0, added: 1, removed: 2, unchanged: 3 };
      const d = rank[a.kind] - rank[b.kind];
      if (d !== 0) return d;
      const aSku = (a.after ?? a.before)?.sku ?? "";
      const bSku = (b.after ?? b.before)?.sku ?? "";
      return aSku.localeCompare(bSku);
    });

  return (
    <div
      className="grid grid-cols-2 gap-4 border-t border-border bg-surface px-4 py-4"
      data-testid="edit-history-diff"
    >
      <Column label="Before" items={entry.before_items} />
      <Column label="After" items={entry.after_items} />

      <div className="col-span-2 text-xs text-fg-muted">
        <p className="mb-1 font-semibold uppercase tracking-wide text-fg-subtle">
          Changes
        </p>
        {rows.filter((r) => r.kind !== "unchanged").length === 0 ? (
          <p>No line-level changes (notes or metadata may have changed).</p>
        ) : (
          <ul className="space-y-0.5 font-numeric">
            {rows
              .filter((r) => r.kind !== "unchanged")
              .map((r) => {
                const display = r.after ?? r.before;
                if (!display) return null;
                if (r.kind === "removed") {
                  return (
                    <li
                      key={r.pid}
                      className="text-danger line-through"
                      data-diff-kind="removed"
                    >
                      − {display.sku} · {display.name} · qty {r.before!.quantity_requested}
                    </li>
                  );
                }
                if (r.kind === "added") {
                  return (
                    <li
                      key={r.pid}
                      className="text-success"
                      data-diff-kind="added"
                    >
                      + {display.sku} · {display.name} · qty {r.after!.quantity_requested}
                    </li>
                  );
                }
                return (
                  <li
                    key={r.pid}
                    className="text-fg"
                    data-diff-kind="changed"
                  >
                    · {display.sku} · {display.name} · {r.before!.quantity_requested} → {r.after!.quantity_requested}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Column({
  label,
  items,
}: {
  label: string;
  items: OrderEditHistoryLineSnapshot[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-fg-muted">(empty)</p>
      ) : (
        <ul className="space-y-0.5 font-numeric text-xs text-fg-muted">
          {items.map((i) => (
            <li key={i.product_id}>
              {i.sku} · {i.name} · qty {i.quantity_requested} ·{" "}
              {formatCents(i.line_net_cents)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
