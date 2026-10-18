import { expect, it } from "vitest";
import { claveComparacion } from "./texto";

it("claveComparacion ignora mayúsculas, acentos y espacios", () => {
  expect(claveComparacion(" Árbol  Grande ")).toBe("arbolgrande");
});
