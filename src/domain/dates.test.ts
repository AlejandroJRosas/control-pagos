import { expect, it } from "vitest";
import { esDiaHabil, nombreDia, esFinDeSemana, fechaDeTasa, formatFecha, formatPeriodo, isValidIsoDate, mascaraFecha, parseFechaVE, sumarDias, todayIso } from "./dates";

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

it("parseFechaVE lee dd/mm/aaaa y variantes", () => {
  expect(parseFechaVE("18/10/2026")).toBe("2026-10-18");
  expect(parseFechaVE("1/5/2026")).toBe("2026-05-01");
  expect(parseFechaVE(" 01-05-26 ")).toBe("2026-05-01");
  expect(parseFechaVE("01.05.2026")).toBe("2026-05-01");
  expect(parseFechaVE("31/02/2026")).toBeNull();
  expect(parseFechaVE("18/10")).toBeNull();
  expect(parseFechaVE("")).toBeNull();
});

it("mascaraFecha agrega las barras al escribir solo dígitos", () => {
  expect(mascaraFecha("1")).toBe("1");
  expect(mascaraFecha("18")).toBe("18");
  expect(mascaraFecha("181")).toBe("18/1");
  expect(mascaraFecha("18/1020")).toBe("18/10/20");
  expect(mascaraFecha("18102026")).toBe("18/10/2026");
  expect(mascaraFecha("181020261")).toBe("18/10/2026");
  expect(mascaraFecha("18/")).toBe("18");
  // Si el usuario escribe sus propias barras, se respeta.
  expect(mascaraFecha("1/5/2026")).toBe("1/5/2026");
});

it("fechaDeTasa: un feriado usa la tasa del último día hábil anterior", () => {
  const fer = new Set(["2026-04-02", "2026-04-03"]);
  expect(fechaDeTasa("2026-04-05", fer)).toBe("2026-04-01"); // domingo de Pascua → Miércoles Santo
  expect(fechaDeTasa("2026-04-02", fer)).toBe("2026-04-01");
  expect(fechaDeTasa("2026-04-06", fer)).toBe("2026-04-06");
  expect(fechaDeTasa("2026-12-25", new Set(["2026-12-24", "2026-12-25"]))).toBe("2026-12-23");
  expect(fechaDeTasa("2026-10-12", new Set(["2026-10-12"]))).toBe("2026-10-09"); // lunes feriado → viernes
});

it("esDiaHabil: ni fin de semana ni feriado", () => {
  expect(esDiaHabil("2026-10-19")).toBe(true);
  expect(esDiaHabil("2026-10-18")).toBe(false);
  expect(esDiaHabil("2026-10-12", new Set(["2026-10-12"]))).toBe(false);
});

it("nombreDia en español", () => {
  expect(nombreDia("2026-10-19")).toBe("lunes");
  expect(nombreDia("2026-10-16")).toBe("viernes");
  expect(nombreDia("2026-10-14")).toBe("miércoles");
  expect(nombreDia("2026-10-17")).toBe("sábado");
});
