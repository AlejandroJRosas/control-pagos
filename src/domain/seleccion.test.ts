import { expect, it } from "vitest";
import { clicSeleccion, seleccionarTodos, SIN_SELECCION, type Seleccion } from "./seleccion";

const orden = [1, 2, 3, 4, 5];
const sel = (ids: number[], ancla: number | null): Seleccion => ({ marcados: new Set(ids), ancla });
const ver = (s: Seleccion) => ({ marcados: [...s.marcados].sort(), ancla: s.ancla });
const clic = (s: Seleccion, id: number, m: { ctrl?: boolean; shift?: boolean } = {}) =>
  ver(clicSeleccion(s, orden, id, { ctrl: m.ctrl ?? false, shift: m.shift ?? false }));

it("un clic deja marcado solo ese y lo vuelve el ancla", () => {
  expect(clic(sel([1, 2], 1), 4)).toEqual({ marcados: [4], ancla: 4 });
});

it("Ctrl+clic agrega o quita uno sin tocar los demás", () => {
  expect(clic(sel([1], 1), 3, { ctrl: true })).toEqual({ marcados: [1, 3], ancla: 3 });
  expect(clic(sel([1, 3], 3), 1, { ctrl: true })).toEqual({ marcados: [3], ancla: 1 });
});

it("Shift+clic marca el rango desde el ancla, en cualquier dirección, y reemplaza lo anterior", () => {
  expect(clic(sel([2, 5], 2), 4, { shift: true })).toEqual({ marcados: [2, 3, 4], ancla: 2 });
  expect(clic(sel([4], 4), 2, { shift: true })).toEqual({ marcados: [2, 3, 4], ancla: 4 });
});

it("Ctrl+Shift+clic suma el rango a lo que ya estaba", () => {
  expect(clic(sel([1, 4], 4), 5, { ctrl: true, shift: true })).toEqual({ marcados: [1, 4, 5], ancla: 4 });
});

it("Shift+clic sin ancla (o con un ancla que ya no se ve) marca solo ese", () => {
  expect(clic(SIN_SELECCION, 3, { shift: true })).toEqual({ marcados: [3], ancla: 3 });
  expect(clic(sel([9], 9), 3, { shift: true })).toEqual({ marcados: [3], ancla: 3 });
});

it("un clic en algo que no se puede marcar limpia la selección; con Ctrl o Shift no cambia nada", () => {
  expect(clic(sel([1, 2], 1), 99)).toEqual({ marcados: [], ancla: null });
  expect(clic(sel([1, 2], 1), 99, { ctrl: true })).toEqual({ marcados: [1, 2], ancla: 1 });
});

it("seleccionar todos marca los visibles y, si ya estaban todos, los desmarca", () => {
  expect(ver(seleccionarTodos(sel([2], 2), orden))).toEqual({ marcados: [1, 2, 3, 4, 5], ancla: 2 });
  expect(ver(seleccionarTodos(sel(orden, 2), orden))).toEqual({ marcados: [], ancla: null });
});
