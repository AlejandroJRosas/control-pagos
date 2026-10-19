import { expect, it } from "vitest";
import { claveComparacion, claveReferencia } from "./texto";

it("claveComparacion ignora mayúsculas, acentos y espacios", () => {
  expect(claveComparacion(" Árbol  Grande ")).toBe("arbolgrande");
});

it("claveReferencia ignora ceros iniciales y espacios", () => {
  expect(claveReferencia("000123")).toBe("123");
  expect(claveReferencia(" 00 12 3 ")).toBe("123");
  expect(claveReferencia("0000")).toBe("0");
  expect(claveReferencia("")).toBe("");
});
