import { describe, expect, it } from "vitest";
import { claveComparacion, claveReferencia, distanciaEdicion } from "./texto";

it("claveComparacion ignora mayúsculas, acentos y espacios", () => {
  expect(claveComparacion(" Árbol  Grande ")).toBe("arbolgrande");
});

it("claveReferencia ignora ceros iniciales y espacios", () => {
  expect(claveReferencia("000123")).toBe("123");
  expect(claveReferencia(" 00 12 3 ")).toBe("123");
  expect(claveReferencia("0000")).toBe("0");
  expect(claveReferencia("")).toBe("");
});

describe("distanciaEdicion", () => {
  it("cuenta las letras que hay que quitar, poner o cambiar", () => {
    expect(distanciaEdicion("", "")).toBe(0);
    expect(distanciaEdicion("abc", "abc")).toBe(0);
    expect(distanciaEdicion("macolecciones", "acolecciones")).toBe(1);
    expect(distanciaEdicion("gato", "pato")).toBe(1);
    expect(distanciaEdicion("abc", "")).toBe(3);
    expect(distanciaEdicion("kitten", "sitting")).toBe(3);
  });
});
