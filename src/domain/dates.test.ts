import { expect, it } from "vitest";
import { esFinDeSemana, fechaDeTasa, formatFecha, formatPeriodo, isValidIsoDate, sumarDias, todayIso } from "./dates";

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

it("sumarDias cruza meses y años", () => {
  expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
  expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
});

it("fechaDeTasa: sábado y domingo usan la tasa del viernes", () => {
  expect(esFinDeSemana("2026-10-17")).toBe(true); // sábado
  expect(esFinDeSemana("2026-10-18")).toBe(true); // domingo
  expect(esFinDeSemana("2026-10-16")).toBe(false);
  expect(fechaDeTasa("2026-10-17")).toBe("2026-10-16");
  expect(fechaDeTasa("2026-10-18")).toBe("2026-10-16");
  expect(fechaDeTasa("2026-10-19")).toBe("2026-10-19");
  expect(fechaDeTasa("2026-11-01")).toBe("2026-10-30"); // domingo con viernes del mes anterior
});
