import { expect, it } from "vitest";
import { BANCOS_SUGERIDOS, sugerenciasBancos } from "./bancos";

it("une sugeridos y usados sin duplicar ignorando mayúsculas", () => {
  const r = sugerenciasBancos(["banesco", "Banco Plaza"]);
  expect(r).toContain("Banco Plaza");
  expect(r.filter((b) => b.toLowerCase() === "banesco")).toHaveLength(1);
  expect(r.length).toBe(BANCOS_SUGERIDOS.length + 1);
  expect([...r].sort((a, b) => a.localeCompare(b, "es"))).toEqual(r);
});
