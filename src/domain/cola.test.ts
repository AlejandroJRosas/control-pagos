import { expect, it } from "vitest";
import { duplicadosEnCola, siguientePendiente } from "./cola";

const p = (id: number) => ({ id, estado: "pendiente" as const });
const h = (id: number) => ({ id, estado: "hecho" as const });

it("siguiente pendiente después del actual, volviendo al inicio", () => {
  const items = [p(1), h(2), p(3), p(4)];
  expect(siguientePendiente(items, 3)).toBe(4);
  expect(siguientePendiente(items, 4)).toBe(1);
  expect(siguientePendiente(items, 2)).toBe(3);
  expect(siguientePendiente(items, null)).toBe(1);
});

it("sin otro pendiente devuelve null", () => {
  expect(siguientePendiente([p(1)], 1)).toBeNull();
  expect(siguientePendiente([h(1)], null)).toBeNull();
  expect(siguientePendiente([], null)).toBeNull();
});

it("si el actual ya no está, toma el primer pendiente", () => {
  expect(siguientePendiente([h(1), p(5)], 3)).toBe(5);
});

const d = (id: number, banco: string, referencia: string, estado = "pendiente") => ({ id, estado, banco, referencia });

it("duplicados en la cola por banco y referencia sin mayúsculas ni espacios", () => {
  const items = [d(1, "Banesco", "00123"), d(2, " banesco ", "00123"), d(3, "Banesco", "999"), d(4, "BANESCO", "00 123", "hecho")];
  expect(duplicadosEnCola(items, 1)).toEqual([2]);
  expect(duplicadosEnCola(items, 3)).toEqual([]);
});

it("no cuenta referencias o bancos vacíos", () => {
  const items = [d(1, "Banesco", ""), d(2, "Banesco", ""), d(3, "", "5"), d(4, "", "5")];
  expect(duplicadosEnCola(items, 1)).toEqual([]);
  expect(duplicadosEnCola(items, 3)).toEqual([]);
});

it("duplicados en la cola con alias de banco y sin ceros iniciales", () => {
  const items = [d(1, "BDV", "0045"), d(2, "Banco de Venezuela", "45"), d(3, "Mercantil", "45")];
  expect(duplicadosEnCola(items, 1)).toEqual([2]);
});
