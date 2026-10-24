import { expect, it } from "vitest";
import { normalizarRamas } from "./ramasPlegadas";

it("normalizarRamas se queda con enteros positivos sin repetir", () => {
  expect(normalizarRamas([3, "x", 3, -1, 2.5])).toEqual([3]);
  expect(normalizarRamas(null)).toEqual([]);
});
