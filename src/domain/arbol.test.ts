import { describe, expect, it } from "vitest";
import { alternarRama, aplanarArbol, armarArbol, cicloEn, creaCiclo, descendientes, estadoRama, type Jefes } from "./arbol";

// Árbol de ejemplo: 1 Ana → 2 Luis → (3 Pedro, 4 María); 1 Ana → 5 Carla; 6 José sin jefe.
const jefes: Jefes = new Map([
  [2, 1],
  [3, 2],
  [4, 2],
  [5, 1],
  [6, null],
]);

describe("arbol", () => {
  it("descendientes de todos los niveles", () => {
    expect(descendientes(jefes, 1).sort()).toEqual([2, 3, 4, 5]);
    expect(descendientes(jefes, 3)).toEqual([]);
  });
  it("creaCiclo: a sí mismo o debajo de su rama", () => {
    expect(creaCiclo(jefes, 1, 1)).toBe(true);
    expect(creaCiclo(jefes, 1, 3)).toBe(true);
    expect(creaCiclo(jefes, 3, 5)).toBe(false);
    expect(creaCiclo(jefes, 2, null)).toBe(false);
  });
  it("cicloEn encuentra A→B→A", () => {
    expect(cicloEn(jefes)).toBeNull();
    expect(
      cicloEn(
        new Map([
          [1, 2],
          [2, 1],
          [3, 1],
        ]),
      )?.sort(),
    ).toEqual([1, 2]);
  });
  it("aplanarArbol en preorden con nivel, debajo y plegados", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const filas = aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x);
    expect(filas.map((f) => [f.item, f.nivel, f.debajo])).toEqual([
      [1, 0, 4],
      [2, 1, 2],
      [3, 2, 0],
      [4, 2, 0],
      [5, 1, 0],
      [6, 0, 0],
    ]);
    expect(aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x, new Set([2])).map((f) => f.item)).toEqual([1, 2, 5, 6]);
  });
  it("un jefe que no está en la lista cuenta como raíz", () => {
    expect(armarArbol([3, 4], (x) => x, jefes).map((n) => n.item)).toEqual([3, 4]);
  });
  it("un ciclo se arma como raíces sin colgarse", () => {
    const ciclo: Jefes = new Map([
      [1, 2],
      [2, 1],
    ]);
    const nodos = armarArbol([1, 2], (x) => x, ciclo);
    expect(nodos.map((n) => n.item)).toEqual([1, 2]);
    expect(nodos.every((n) => n.hijos.length === 0)).toBe(true);
  });
  it("alternarRama y estadoRama", () => {
    const m = alternarRama(new Set(), jefes, 2);
    expect([...m].sort()).toEqual([2, 3, 4]);
    expect(estadoRama(m, jefes, 1)).toBe("parte");
    expect(estadoRama(m, jefes, 2)).toBe("todo");
    expect(estadoRama(m, jefes, 5)).toBe("nada");
    expect([...alternarRama(m, jefes, 2)]).toEqual([]);
  });
});
