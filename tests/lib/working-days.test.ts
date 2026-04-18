import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  isWorkingDay,
  workingDaysBetween,
} from "@/lib/dates/working-days";

/**
 * All fixture dates are pinned in UTC via ISO strings; Europe/Amsterdam
 * is the default tz for the helper, so the assertions reflect what an
 * NL operator would experience.
 *
 * Reference dates (Europe/Amsterdam wall clock):
 *   2026-04-13 Mon  – inside CEST (UTC+2)
 *   2026-04-17 Fri  – inside CEST
 *   2026-04-18 Sat  – weekend
 *   2026-04-19 Sun  – weekend
 *   2026-04-20 Mon  – inside CEST
 *   2026-03-29 Sun  – DST starts (CET → CEST) at 02:00 local
 *   2026-10-25 Sun  – DST ends   (CEST → CET) at 03:00 local
 *   2026-12-29 Tue  – CET (UTC+1)
 */

const tz = "Europe/Amsterdam";

const at = (iso: string) => new Date(iso);

describe("isWorkingDay (Europe/Amsterdam)", () => {
  it("returns true for Mon–Fri", () => {
    // 2026-04-13 Mon 10:00 CEST = 08:00Z
    expect(isWorkingDay(at("2026-04-13T08:00:00Z"))).toBe(true);
    expect(isWorkingDay(at("2026-04-14T08:00:00Z"))).toBe(true);
    expect(isWorkingDay(at("2026-04-15T08:00:00Z"))).toBe(true);
    expect(isWorkingDay(at("2026-04-16T08:00:00Z"))).toBe(true);
    expect(isWorkingDay(at("2026-04-17T08:00:00Z"))).toBe(true);
  });

  it("returns false for Sat / Sun", () => {
    expect(isWorkingDay(at("2026-04-18T08:00:00Z"))).toBe(false);
    expect(isWorkingDay(at("2026-04-19T08:00:00Z"))).toBe(false);
  });

  it("ignores time-of-day — only the local date matters", () => {
    // 2026-04-19 Sun 23:30 CEST = Sun 21:30Z, still Sun → non-working
    expect(isWorkingDay(at("2026-04-19T21:30:00Z"))).toBe(false);
    // 2026-04-20 Mon 00:30 CEST = Sun 22:30Z, but locally it's Monday → working
    expect(isWorkingDay(at("2026-04-19T22:30:00Z"))).toBe(true);
  });

  it("treats supplied holidays as non-working (per local day)", () => {
    const koningsdag = at("2026-04-27T00:00:00Z"); // Mon 02:00 CEST
    expect(isWorkingDay(koningsdag)).toBe(true);
    expect(
      isWorkingDay(koningsdag, { holidays: [koningsdag] }),
    ).toBe(false);
    // Different time, same local day → still matches.
    expect(
      isWorkingDay(at("2026-04-27T15:00:00Z"), {
        holidays: [at("2026-04-27T00:00:00Z")],
      }),
    ).toBe(false);
  });
});

describe("addWorkingDays", () => {
  it("simple Mon → Tue", () => {
    const out = addWorkingDays(at("2026-04-13T12:00:00Z"), 1);
    expect(out.toISOString()).toBe("2026-04-14T12:00:00.000Z");
  });

  it("Fri + 1 → Mon (skips weekend)", () => {
    const out = addWorkingDays(at("2026-04-17T12:00:00Z"), 1);
    expect(out.toISOString()).toBe("2026-04-20T12:00:00.000Z");
  });

  it("Wed - 2 → Mon (subtraction works)", () => {
    const wed = at("2026-04-15T08:00:00Z");
    const out = addWorkingDays(wed, -2);
    expect(out.toISOString()).toBe("2026-04-13T08:00:00.000Z");
  });

  it("starting from Sun, +1 lands on Mon (the first working day after start)", () => {
    // Sun 12:00 CEST → bump to Mon 12:00 CEST. The starting day was
    // non-working, so the first +1 increment lands on Monday — the
    // first working day visited counts. This matches the spec's
    // "submitted on Sunday → cancel after 2 working days" intent.
    const sun = at("2026-04-19T12:00:00Z");
    const out = addWorkingDays(sun, 1);
    expect(out.toISOString()).toBe("2026-04-20T12:00:00.000Z");
  });

  it("n=0 returns a fresh Date with the same instant", () => {
    const src = at("2026-04-15T08:00:00Z");
    const out = addWorkingDays(src, 0);
    expect(out).not.toBe(src);
    expect(out.toISOString()).toBe(src.toISOString());
  });

  it("respects holidays — skips them like weekends", () => {
    // Tue → Thu would normally be +1 working day, but if Wed is a
    // holiday the next working day after Tue is Thu.
    const tue = at("2026-04-14T08:00:00Z");
    const wed = at("2026-04-15T08:00:00Z");
    const out = addWorkingDays(tue, 1, { holidays: [wed] });
    expect(out.toISOString()).toBe("2026-04-16T08:00:00.000Z");
  });

  it("survives a DST boundary (UTC offset shifts) without losing/gaining a day", () => {
    // CET → CEST happens overnight 2026-03-29. addWorkingDays(Fri-27, 1)
    // should land on Mon-30, 24h-of-UTC apart in winter but only 23h
    // apart in summer. We don't normalise the time-of-day — the UTC
    // instant just shifts in 24h chunks, which is the right behaviour
    // for an SLA cutoff (we care about elapsed UTC time).
    const fri = at("2026-03-27T12:00:00Z");
    const mon = addWorkingDays(fri, 1);
    // 2026-03-28 Sat, 2026-03-29 Sun → skip → 2026-03-30 Mon
    expect(mon.toISOString()).toBe("2026-03-30T12:00:00.000Z");
  });
});

describe("workingDaysBetween", () => {
  it("counts Mon → Wed as 2 working days (Tue + Wed)", () => {
    expect(
      workingDaysBetween(at("2026-04-13T08:00:00Z"), at("2026-04-15T08:00:00Z")),
    ).toBe(2);
  });

  it("Mon → Mon next week = 5 working days (skips one weekend)", () => {
    expect(
      workingDaysBetween(at("2026-04-13T08:00:00Z"), at("2026-04-20T08:00:00Z")),
    ).toBe(5);
  });

  it("Fri → Mon = 1 working day (Sat/Sun skipped)", () => {
    expect(
      workingDaysBetween(at("2026-04-17T08:00:00Z"), at("2026-04-20T08:00:00Z")),
    ).toBe(1);
  });

  it("backwards iteration → negative count", () => {
    expect(
      workingDaysBetween(at("2026-04-15T08:00:00Z"), at("2026-04-13T08:00:00Z")),
    ).toBe(-2);
  });

  it("same instant → 0", () => {
    const t = at("2026-04-15T08:00:00Z");
    expect(workingDaysBetween(t, t)).toBe(0);
  });
});

describe("addWorkingDays + isWorkingDay agreement (round-trip)", () => {
  it("for any working-day start, addWorkingDays(start, n) returns a working day", () => {
    const starts = [
      at("2026-04-13T08:00:00Z"),
      at("2026-04-14T08:00:00Z"),
      at("2026-04-17T08:00:00Z"),
      at("2026-12-29T09:00:00Z"), // CET sample
    ];
    for (const start of starts) {
      for (const n of [1, 3, 5, 10, -1, -3, -7]) {
        const out = addWorkingDays(start, n);
        expect(
          isWorkingDay(out),
          `addWorkingDays(${start.toISOString()}, ${n}) → ${out.toISOString()} expected to be a working day`,
        ).toBe(true);
      }
    }
  });
});

void tz;
