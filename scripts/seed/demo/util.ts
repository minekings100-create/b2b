/**
 * Shared helpers for the demo seed. Deterministic RNG so re-running the seed
 * produces the same data (stable IDs, timestamps, numbers).
 */

export function seedRand(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function pickOne<T>(rand: () => number, arr: readonly T[]): T {
  const item = arr[Math.floor(rand() * arr.length)];
  if (item === undefined) {
    throw new Error("pickOne on empty array");
  }
  return item;
}

export function pickMany<T>(rand: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

/** Pad an integer counter to width with leading zeros. */
export function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

/** ISO timestamp `n` days before `base`. */
export function daysBefore(base: Date, n: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/** ISO timestamp `n` days after `base`. */
export function daysAfter(base: Date, n: number): string {
  return daysBefore(base, -n);
}

/** Marker attached to every audit_log row the demo seed creates so we can
 *  wipe them deterministically on re-runs. */
export const DEMO_FLAG = { _demo: true } as const;
