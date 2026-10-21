import { expect, it } from "vitest";
import { antelacionDeAjuste, cumpleEnAnio, cumpleanosDelMes, cumpleanosProximos, proximoCumple, textoFaltan } from "./cumpleanos";

it("el cumpleaños de un año; el 29 de febrero cae el 28 en años no bisiestos", () => {
  expect(cumpleEnAnio("1990-10-23", 2026)).toBe("2026-10-23");
  expect(cumpleEnAnio("1992-02-29", 2026)).toBe("2026-02-28");
  expect(cumpleEnAnio("1992-02-29", 2028)).toBe("2028-02-29");
});

it("próximo cumpleaños: días que faltan y edad que cumple", () => {
  expect(proximoCumple("1990-10-23", "2026-10-20")).toEqual({ fecha: "2026-10-23", dias: 3, edad: 36 });
  expect(proximoCumple("1990-10-20", "2026-10-20")).toEqual({ fecha: "2026-10-20", dias: 0, edad: 36 });
  // Ya pasó este año → el del año que viene.
  expect(proximoCumple("1990-10-19", "2026-10-20")).toEqual({ fecha: "2027-10-19", dias: 364, edad: 37 });
  // Cruce de año.
  expect(proximoCumple("1990-01-02", "2026-12-30")).toEqual({ fecha: "2027-01-02", dias: 3, edad: 37 });
  expect(proximoCumple("1992-02-29", "2027-02-27")).toEqual({ fecha: "2027-02-28", dias: 1, edad: 35 });
});

const gerentes = [
  { id: 1, nombre: "Luis", nacimiento: "1990-10-23" },
  { id: 2, nombre: "Ana", nacimiento: "1985-10-20" },
  { id: 3, nombre: "Beto", nacimiento: "1990-10-24" },
  { id: 4, nombre: "Caro", nacimiento: null },
  { id: 5, nombre: "Dani", nacimiento: "2000-10-23" },
];

it("lista los cumpleaños dentro de la antelación, el más cercano primero y por nombre", () => {
  expect(cumpleanosProximos(gerentes, "2026-10-20", 3)).toEqual([
    { id: 2, nombre: "Ana", fecha: "2026-10-20", dias: 0, edad: 41 },
    { id: 5, nombre: "Dani", fecha: "2026-10-23", dias: 3, edad: 26 },
    { id: 1, nombre: "Luis", fecha: "2026-10-23", dias: 3, edad: 36 },
  ]);
  expect(cumpleanosProximos(gerentes, "2026-10-20", 0).map((c) => c.nombre)).toEqual(["Ana"]);
});

it("no cuenta fechas de nacimiento futuras", () => {
  expect(cumpleanosProximos([{ id: 1, nombre: "X", nacimiento: "2026-10-22" }], "2026-10-20", 3)).toEqual([]);
});

it("cumpleaños por día de un mes, con la edad de ese año", () => {
  const m = cumpleanosDelMes("2026-10", gerentes);
  expect([...m.keys()].sort()).toEqual(["2026-10-20", "2026-10-23", "2026-10-24"]);
  expect(m.get("2026-10-23")).toEqual([
    { id: 5, nombre: "Dani", edad: 26 },
    { id: 1, nombre: "Luis", edad: 36 },
  ]);
  // Antes de nacer no hay cumpleaños.
  expect(cumpleanosDelMes("2000-10", gerentes).get("2000-10-23")).toEqual([{ id: 1, nombre: "Luis", edad: 10 }]);
  expect(cumpleanosDelMes("2028-02", [{ id: 1, nombre: "X", nacimiento: "1992-02-29" }]).has("2028-02-29")).toBe(true);
  expect(cumpleanosDelMes("2027-02", [{ id: 1, nombre: "X", nacimiento: "1992-02-29" }]).has("2027-02-28")).toBe(true);
});

it("antelación guardada: 3 por defecto, entre 0 y 30", () => {
  expect(antelacionDeAjuste(null)).toBe(3);
  expect(antelacionDeAjuste("7")).toBe(7);
  expect(antelacionDeAjuste("0")).toBe(0);
  expect(antelacionDeAjuste("x")).toBe(3);
  expect(antelacionDeAjuste("99")).toBe(30);
  expect(antelacionDeAjuste("-2")).toBe(0);
});

it("texto de los días que faltan", () => {
  expect(textoFaltan(0)).toBe("hoy");
  expect(textoFaltan(1)).toBe("mañana");
  expect(textoFaltan(3)).toBe("en 3 días");
});
