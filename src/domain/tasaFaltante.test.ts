import { expect, it } from "vitest";
import { tasasFaltantes } from "./tasaFaltante";

const fer = new Set(["2026-10-12"]);

it("avisa si hoy es hábil y no tiene tasa", () => {
  expect(tasasFaltantes("2026-10-19", new Set(), fer, [])).toEqual({ hoy: "2026-10-19", anteriores: [] });
});

it("en fin de semana o feriado avisa la del siguiente día hábil, que rige hoy", () => {
  expect(tasasFaltantes("2026-10-18", new Set(), fer, []).hoy).toBe("2026-10-19");
  expect(tasasFaltantes("2026-10-10", new Set(), fer, []).hoy).toBe("2026-10-13"); // lunes 12 feriado → martes
  expect(tasasFaltantes("2026-10-12", new Set(), fer, []).hoy).toBe("2026-10-13");
});

it("no avisa si ya hay tasa", () => {
  expect(tasasFaltantes("2026-10-19", new Set(["2026-10-19"]), fer, []).hoy).toBeNull();
  expect(tasasFaltantes("2026-10-17", new Set(["2026-10-19"]), fer, []).hoy).toBeNull();
});

it("lista los días anteriores sin tasa que necesita la cola, sin repetir y ordenados", () => {
  const r = tasasFaltantes("2026-10-19", new Set(["2026-10-19", "2026-10-14"]), fer, ["2026-10-15", "2026-10-09", "2026-10-15", "2026-10-11", "", "2026-10-14", "2026-10-18", "2026-10-20"]);
  // 11/10 es domingo → 13/10 (el 12 es feriado); el 14 ya tiene tasa; el 18 usa la de hoy; el futuro no cuenta; "" se ignora.
  expect(r.anteriores).toEqual(["2026-10-09", "2026-10-13", "2026-10-15"]);
});
