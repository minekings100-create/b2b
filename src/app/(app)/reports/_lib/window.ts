import { z } from "zod";

import type { DateWindow } from "@/lib/db/reports";

/**
 * Phase 7b-2c — URL-driven date window for the reports pages.
 *
 * Every report accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD`. If either is
 * missing or invalid, the helper falls back to a sensible default
 * (last 30 days ending today in UTC). Zod-parsed at the page trust
 * boundary — same discipline as the filter chips + sortable headers.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const ParamSchema = z.object({
  from: z.string().regex(YMD).optional(),
  to: z.string().regex(YMD).optional(),
});

export function parseWindow(
  searchParams: Record<string, string | string[] | undefined>,
): DateWindow {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") flat[k] = v;
  }
  const parsed = ParamSchema.safeParse(flat);
  const today = utcToday();
  const defaultFrom = addDays(today, -30);

  const from = parsed.success && parsed.data.from ? parsed.data.from : defaultFrom;
  const to = parsed.success && parsed.data.to ? parsed.data.to : today;
  return { from, to };
}

export function utcToday(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + n);
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
