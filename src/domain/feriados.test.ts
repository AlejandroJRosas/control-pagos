import { expect, it } from "vitest";
import { feriadosNacionales, pascua } from "./feriados";

it("pascua según el calendario gregoriano", () => {
  expect(pascua(2025)).toBe("2025-04-20");
  expect(pascua(2026)).toBe("2026-04-05");
  expect(pascua(2027)).toBe("2027-03-28");
  expect(pascua(2038)).toBe("2038-04-25");
});

it("feriados nacionales de Venezuela de 2026", () => {
  const f = feriadosNacionales(2026);
  expect(f.map((x) => x.fecha).sort()).toEqual([
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-02", "2026-04-03", "2026-04-19", "2026-05-01",
    "2026-06-24", "2026-07-05", "2026-07-24", "2026-10-12", "2026-12-24", "2026-12-25", "2026-12-31",
  ]);
  expect(f.find((x) => x.fecha === "2026-02-16")?.nombre).toBe("Lunes de Carnaval");
  expect(f.find((x) => x.fecha === "2026-04-03")?.nombre).toBe("Viernes Santo");
  expect(f.find((x) => x.fecha === "2026-10-12")?.nombre).toBe("Día de la Resistencia Indígena");
});
