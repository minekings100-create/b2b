import { describe, expect, it } from "vitest";

import {
  amsterdamHourNow,
  isExpectedAmsterdamHour,
} from "@/lib/dates/dst-cron";

/**
 * Phase 7b-1 — DST cron hour gate.
 *
 * Reference instants (UTC → Europe/Amsterdam local):
 *   2026-01-15T07:00:00Z  =  08:00 CET  (winter, UTC+1)
 *   2026-01-15T06:00:00Z  =  07:00 CET
 *   2026-07-15T06:00:00Z  =  08:00 CEST (summer, UTC+2)
 *   2026-07-15T07:00:00Z  =  09:00 CEST
 *   2026-03-29T01:30:00Z  =  03:30 CEST  (just after spring-forward
 *                                          — clocks jumped 02:00→03:00)
 *   2026-10-25T01:30:00Z  =  02:30 CET  (in the fall-back overlap;
 *                                          first occurrence of 02:30)
 */

describe("isExpectedAmsterdamHour", () => {
  it("matches winter UTC+1 → 08:00 CET", () => {
    expect(
      isExpectedAmsterdamHour(8, new Date("2026-01-15T07:00:00Z")),
    ).toBe(true);
    expect(
      isExpectedAmsterdamHour(7, new Date("2026-01-15T07:00:00Z")),
    ).toBe(false);
  });

  it("matches summer UTC+2 → 08:00 CEST (the same target hour, different UTC offset)", () => {
    expect(
      isExpectedAmsterdamHour(8, new Date("2026-07-15T06:00:00Z")),
    ).toBe(true);
    // The other half of the double-schedule (`0 7 UTC`) fires here in
    // summer, when Amsterdam is at 09:00 — gate must reject it.
    expect(
      isExpectedAmsterdamHour(8, new Date("2026-07-15T07:00:00Z")),
    ).toBe(false);
  });

  it("rejects the off-DST-half firing in winter", () => {
    // `0 6 UTC` is the summer schedule — fires at 07:00 in winter.
    expect(
      isExpectedAmsterdamHour(8, new Date("2026-01-15T06:00:00Z")),
    ).toBe(false);
  });

  it("handles the spring-forward gap correctly (no 02:30 CEST exists; clocks land on 03:30)", () => {
    expect(
      isExpectedAmsterdamHour(3, new Date("2026-03-29T01:30:00Z")),
    ).toBe(true);
  });

  it("returns false for hours far from the target", () => {
    expect(
      isExpectedAmsterdamHour(8, new Date("2026-01-15T15:00:00Z")),
    ).toBe(false);
  });
});

describe("amsterdamHourNow", () => {
  it("returns the local hour for a winter instant", () => {
    expect(amsterdamHourNow(new Date("2026-01-15T07:00:00Z"))).toBe(8);
  });

  it("returns the local hour for a summer instant", () => {
    expect(amsterdamHourNow(new Date("2026-07-15T06:00:00Z"))).toBe(8);
  });

  it("returns 0..23, never 24", () => {
    // 2026-01-01T22:30:00Z = Jan 1 23:30 CET
    expect(amsterdamHourNow(new Date("2026-01-01T22:30:00Z"))).toBe(23);
    // 2026-01-01T23:30:00Z = Jan 2 00:30 CET
    expect(amsterdamHourNow(new Date("2026-01-01T23:30:00Z"))).toBe(0);
  });
});
