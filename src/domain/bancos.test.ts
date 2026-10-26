import { expect, it } from "vitest";
import { BANCOS_SUGERIDOS, bancoCanonico, claveBanco, claveDuplicado, clavePosibleRepetido, sinReferenciaUnica, sugerenciasBancos } from "./bancos";
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
  expect(claveBanco("BDT")).toBe(claveBanco("Banco Digital de los Trabajadores"));
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

it("bancoCanonico lleva cada nombre al de la lista, a un alias o a uno recordado", () => {
  expect(bancoCanonico("BANCO PROVINCIAL")).toBe("Provincial");
  expect(bancoCanonico("bbva provincial")).toBe("Provincial");
  expect(bancoCanonico("banesco")).toBe("Banesco");
  expect(bancoCanonico("Banco Plaza")).toBe("Plaza");
  expect(bancoCanonico("BANCO XYZ")).toBeNull();
  expect(bancoCanonico("BANCO XYZ", new Map([["bancoxyz", "Bancamiga"]]))).toBe("Bancamiga");
  expect(bancoCanonico("")).toBeNull();
});

it("el Provincial no tiene clave de duplicado", () => {
  expect(sinReferenciaUnica("BBVA Provincial")).toBe(true);
  expect(sinReferenciaUnica("Banesco")).toBe(false);
  expect(claveDuplicado("BBVA Provincial", "12345678")).toBe("");
  expect(claveDuplicado("Banesco", "123")).not.toBe("");
});

it("clavePosibleRepetido compara cédula, fecha y monto solo en el Provincial", () => {
  const base = clavePosibleRepetido("Provincial", "V-12.345.678", "2026-10-20", "1500.00");
  expect(base).not.toBe("");
  expect(clavePosibleRepetido("BANCO PROVINCIAL", "012345678", "2026-10-20", "1500")).toBe(base);
  expect(clavePosibleRepetido("Provincial", "12345678", "2026-10-21", "1500")).not.toBe(base);
  expect(clavePosibleRepetido("Provincial", "12345678", "2026-10-20", "1500.01")).not.toBe(base);
  expect(clavePosibleRepetido("Banesco", "12345678", "2026-10-20", "1500")).toBe("");
  expect(clavePosibleRepetido("Provincial", "V-", "2026-10-20", "1500")).toBe("");
  expect(clavePosibleRepetido("Provincial", "123", "2026-10-20", "abc")).toBe("");
});
