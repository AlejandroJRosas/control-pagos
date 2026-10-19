import { expect, it } from "vitest";
import { tasasFaltantes } from "./tasaFaltante";

const fer = new Set(["2026-10-12"]);

it("avisa si hoy es hábil y no tiene tasa", () => {
  expect(tasasFaltantes("2026-10-19", new Set(), fer, [])).toEqual({ hoy: true, anteriores: [] });
});

it("no avisa en fin de semana, feriado ni si ya hay tasa", () => {
  expect(tasasFaltantes("2026-10-18", new Set(), fer, []).hoy).toBe(false);
  expect(tasasFaltantes("2026-10-12", new Set(), fer, []).hoy).toBe(false);
  expect(tasasFaltantes("2026-10-19", new Set(["2026-10-19"]), fer, []).hoy).toBe(false);
});

it("lista los días anteriores sin tasa que necesita la cola, sin repetir y ordenados", () => {
  const r = tasasFaltantes("2026-10-19", new Set(["2026-10-19", "2026-10-13"]), fer, ["2026-10-15", "2026-10-14", "2026-10-15", "2026-10-11", "", "2026-10-13", "2026-10-19", "2026-10-20"]);
  // 11/10 es domingo → 09/10 (el 12 es feriado); el 13 ya tiene tasa; hoy y el futuro no cuentan; "" se ignora.
  expect(r.anteriores).toEqual(["2026-10-09", "2026-10-14", "2026-10-15"]);
});
