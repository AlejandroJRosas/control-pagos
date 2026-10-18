import { expect, it } from "vitest";
import { formatFecha, formatPeriodo, isValidIsoDate, todayIso } from "./dates";

it("formatFecha", () => {
  expect(formatFecha("2026-10-18")).toBe("18/10/2026");
});

it("isValidIsoDate", () => {
  expect(isValidIsoDate("2026-10-18")).toBe(true);
  expect(isValidIsoDate("2028-02-29")).toBe(true);
  expect(isValidIsoDate("2026-02-29")).toBe(false);
  expect(isValidIsoDate("2026-13-01")).toBe(false);
  expect(isValidIsoDate("18/10/2026")).toBe(false);
  expect(isValidIsoDate("")).toBe(false);
});

it("todayIso usa la fecha local", () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
});

it("formatPeriodo", () => {
  expect(formatPeriodo("2026-03-01", "2026-03-31")).toBe("01/03/2026 – 31/03/2026");
  expect(formatPeriodo("2026-03-01", null)).toBe("01/03/2026 – en curso");
});
