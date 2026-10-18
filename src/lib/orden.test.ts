import { expect, it } from "vitest";
import { ordenar, siguienteOrden, type Columnas } from "./orden";

type F = { id: number; nombre: string; monto: string; n: number | null };
const filas: F[] = [
  { id: 1, nombre: "Beto", monto: "1000.5", n: 2 },
  { id: 2, nombre: "ána", monto: "99", n: null },
  { id: 3, nombre: "Carla", monto: "1000.5", n: 1 },
];
const cols: Columnas<F, "nombre" | "monto" | "n"> = {
  nombre: { tipo: "texto", valor: (f) => f.nombre },
  monto: { tipo: "decimal", valor: (f) => f.monto },
  n: { tipo: "numero", valor: (f) => f.n },
};
const ids = (r: F[]) => r.map((f) => f.id);

it("sin orden respeta el original", () => {
  expect(ids(ordenar(filas, cols, null))).toEqual([1, 2, 3]);
});

it("texto sin distinguir mayúsculas ni acentos", () => {
  expect(ids(ordenar(filas, cols, { key: "nombre", dir: 1 }))).toEqual([2, 1, 3]);
  expect(ids(ordenar(filas, cols, { key: "nombre", dir: -1 }))).toEqual([3, 1, 2]);
});

it("decimales exactos (no como texto) y empates estables", () => {
  expect(ids(ordenar(filas, cols, { key: "monto", dir: 1 }))).toEqual([2, 1, 3]);
  expect(ids(ordenar(filas, cols, { key: "monto", dir: -1 }))).toEqual([1, 3, 2]);
});

it("los vacíos van al final en ambos sentidos", () => {
  expect(ids(ordenar(filas, cols, { key: "n", dir: 1 }))).toEqual([3, 1, 2]);
  expect(ids(ordenar(filas, cols, { key: "n", dir: -1 }))).toEqual([1, 3, 2]);
});

it("siguienteOrden: ascendente → descendente → sin orden; otra columna empieza ascendente", () => {
  expect(siguienteOrden(null, "a")).toEqual({ key: "a", dir: 1 });
  expect(siguienteOrden({ key: "a", dir: 1 }, "a")).toEqual({ key: "a", dir: -1 });
  expect(siguienteOrden({ key: "a", dir: -1 }, "a")).toBeNull();
  expect(siguienteOrden({ key: "a", dir: -1 }, "b")).toEqual({ key: "b", dir: 1 });
});
