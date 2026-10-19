import { expect, it } from "vitest";
import { gruposDuplicados } from "./duplicados";

const d = (id: number, banco: string, referencia: string, fecha = "2026-03-02", creadoEn = "2026-03-02T10:00:00Z") => ({ id, banco, referencia, fecha, creadoEn });

it("agrupa por banco y referencia (con alias y ceros iniciales) y deja fuera los únicos", () => {
  const g = gruposDuplicados([d(1, "Banesco", "123"), d(2, "BDV", "0456"), d(3, "banesco ", "0123"), d(4, "Banco de Venezuela", "456"), d(5, "Mercantil", "123")]);
  expect(g.map((x) => x.map((y) => y.id))).toEqual([
    [1, 3],
    [2, 4],
  ]);
});

it("ordena cada grupo cronológicamente y los grupos por su primer depósito", () => {
  const g = gruposDuplicados([d(1, "A", "9", "2026-03-05"), d(2, "B", "8", "2026-03-04"), d(3, "A", "9", "2026-03-01"), d(4, "B", "8", "2026-03-06")]);
  expect(g.map((x) => x.map((y) => y.id))).toEqual([
    [3, 1],
    [2, 4],
  ]);
});

it("sin banco o sin referencia no hay duplicado", () => {
  expect(gruposDuplicados([d(1, "", "1"), d(2, "", "1"), d(3, "A", ""), d(4, "A", "")])).toEqual([]);
});
