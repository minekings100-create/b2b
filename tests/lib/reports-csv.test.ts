import { describe, expect, it } from "vitest";

import {
  buildCsv,
  centsToDecimalString,
  contentDisposition,
} from "@/lib/reports/csv";

/**
 * Phase 7b-2c — CSV builder unit tests.
 *
 * The builder hand-rolls RFC 4180 minus BOM. The rules that matter:
 *  - any cell containing a comma, quote, CR, or LF wraps in double quotes
 *  - interior quotes double up
 *  - lines join with CRLF
 *  - empty and null cells are rendered as empty strings
 */

describe("buildCsv", () => {
  it("emits the header followed by rows, CRLF-joined", () => {
    expect(buildCsv(["a", "b"], [["1", "2"], ["3", "4"]])).toBe(
      "a,b\r\n1,2\r\n3,4",
    );
  });

  it("quotes cells that contain a comma", () => {
    expect(buildCsv(["name"], [["Smith, John"]])).toBe('name\r\n"Smith, John"');
  });

  it("quotes cells that contain a double quote and doubles the quote", () => {
    expect(buildCsv(["s"], [['he said "hi"']])).toBe('s\r\n"he said ""hi"""');
  });

  it("quotes cells that contain CR or LF", () => {
    expect(buildCsv(["s"], [["line1\nline2"]])).toBe('s\r\n"line1\nline2"');
    expect(buildCsv(["s"], [["a\r\nb"]])).toBe('s\r\n"a\r\nb"');
  });

  it("renders null/undefined as empty cells", () => {
    expect(
      buildCsv(["a", "b", "c"], [[null, undefined, "x"]]),
    ).toBe("a,b,c\r\n,,x");
  });

  it("coerces numbers to strings without quoting", () => {
    expect(buildCsv(["n"], [[42], [3.14]])).toBe("n\r\n42\r\n3.14");
  });
});

describe("centsToDecimalString", () => {
  it("formats whole euros with two decimals", () => {
    expect(centsToDecimalString(0)).toBe("0.00");
    expect(centsToDecimalString(100)).toBe("1.00");
    expect(centsToDecimalString(1234)).toBe("12.34");
  });

  it("handles non-round cents", () => {
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(99)).toBe("0.99");
  });

  it("handles negative values", () => {
    expect(centsToDecimalString(-1234)).toBe("-12.34");
  });
});

describe("contentDisposition", () => {
  it("builds an attachment header with the supplied filename", () => {
    expect(contentDisposition("report.csv")).toBe(
      'attachment; filename="report.csv"',
    );
  });

  it("strips embedded quotes from the filename", () => {
    expect(contentDisposition('bad"name.csv')).toBe(
      'attachment; filename="badname.csv"',
    );
  });
});
