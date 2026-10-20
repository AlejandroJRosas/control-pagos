import { expect, it } from "vitest";
import { calendarioTasas, mesSiguiente } from "./calendarioTasas";

const t = (fecha: string, valor = "40") => ({ id: 1, fecha, valor });

it("arma semanas de lunes a domingo con relleno de los meses vecinos", () => {
  const c = calendarioTasas("2026-10", [], "2026-12-31");
  expect(c.semanas).toHaveLength(5);
  expect(c.semanas[0][0]).toMatchObject({ fecha: "2026-09-28", delMes: false });
  expect(c.semanas[0][3]).toMatchObject({ fecha: "2026-10-01", dia: 1, delMes: true });
  expect(c.semanas[4][6]).toMatchObject({ fecha: "2026-11-01", delMes: false });
  expect(c.semanas.every((s) => s.length === 7)).toBe(true);
});

it("clasifica cada día: con tasa, fin de semana (usa la del lunes), falta o futuro", () => {
  const lunes = t("2026-10-19", "41");
  const c = calendarioTasas("2026-10", [t("2026-10-15"), lunes], "2026-10-21");
  const dia = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!;
  expect(dia("2026-10-15")).toMatchObject({ estado: "tasa", tasa: t("2026-10-15") });
  expect(dia("2026-10-17")).toMatchObject({ estado: "finde", tasa: lunes });
  expect(dia("2026-10-18")).toMatchObject({ estado: "finde", tasa: lunes });
  expect(dia("2026-10-11")).toMatchObject({ estado: "finde", tasa: null });
  expect(dia("2026-10-14")).toMatchObject({ estado: "falta", tasa: null });
  expect(dia("2026-10-21")).toMatchObject({ estado: "falta" });
  expect(dia("2026-10-22")).toMatchObject({ estado: "futuro", tasa: null });
  // Hábiles del 1 al 21 sin los dos registrados.
  expect(c.faltan).toBe(13);
});

it("mesSiguiente avanza y retrocede cruzando el año", () => {
  expect(mesSiguiente("2026-12", 1)).toBe("2027-01");
  expect(mesSiguiente("2026-01", -1)).toBe("2025-12");
});

it("un feriado sin tasa propia usa la del siguiente día hábil y no cuenta como falta", () => {
  const martes = t("2026-10-13", "39");
  const c = calendarioTasas("2026-10", [martes], "2026-10-12", new Set(["2026-10-12"]));
  const dia = (f: string) => c.semanas.flat().find((d) => d.fecha === f)!;
  expect(dia("2026-10-12")).toMatchObject({ estado: "feriado", tasa: martes });
  expect(dia("2026-10-11")).toMatchObject({ estado: "finde", tasa: martes });
  // Hábiles del 1 al 12 (sin el 12, feriado); el martes 13 está registrado pero aún no llega.
  expect(c.faltan).toBe(7);
});
