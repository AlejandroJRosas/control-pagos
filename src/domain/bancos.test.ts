import { expect, it } from "vitest";
import { BANCOS_SUGERIDOS, claveBanco, claveDuplicado, sugerenciasBancos } from "./bancos";
import { claveComparacion } from "./texto";

it("une sugeridos y usados sin duplicar ignorando mayúsculas", () => {
  const r = sugerenciasBancos(["banesco", "Banco Plaza"]);
  expect(r).toContain("Banco Plaza");
  expect(r.filter((b) => b.toLowerCase() === "banesco")).toHaveLength(1);
  expect(r.length).toBe(BANCOS_SUGERIDOS.length + 1);
  expect([...r].sort((a, b) => a.localeCompare(b, "es"))).toEqual(r);
});

it("claveBanco reconoce los alias de un mismo banco", () => {
  for (const b of ["BDV", "Venezuela", "banco venezuela", "Banco de Venezuela"]) expect(claveBanco(b)).toBe(claveBanco("Venezuela"));
  expect(claveBanco("Banco Mercantil")).toBe(claveBanco("Mercantil"));
  expect(claveBanco("Banesco Banco Universal")).toBe(claveBanco("Banesco"));
  expect(claveBanco("Banco Nacional de Crédito")).toBe(claveBanco("BNC"));
  expect(claveBanco("BBVA Provincial")).toBe(claveBanco("Provincial"));
  expect(claveBanco("Tesoro")).toBe(claveBanco("Banco del Tesoro"));
  expect(claveBanco("Banesco")).not.toBe(claveBanco("Mercantil"));
});

it("claveBanco de un banco desconocido es su clave de comparación", () => {
  expect(claveBanco("Banco Raro")).toBe(claveComparacion("Banco Raro"));
});

it("claveDuplicado une banco y referencia, vacía si falta alguno", () => {
  expect(claveDuplicado("BDV", "0045")).toBe(claveDuplicado("Banco de Venezuela", "45"));
  expect(claveDuplicado("", "45")).toBe("");
  expect(claveDuplicado("BDV", " ")).toBe("");
});
