import { describe, expect, it } from "vitest";
import { acomodarDirectos, alternarRama, aplanarArbol, aplanarConCierres, armarArbol, cicloEn, creaCiclo, descendientes, estadoRama, type Jefes, type LugarDirecto, type NodoArbol } from "./arbol";

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
  it("armarArbol pone primero a los que no tienen a nadie debajo, sin cambiar el orden dentro de cada grupo", () => {
    const j: Jefes = new Map([
      [2, 1],
      [4, 2],
      [3, 1],
      [5, null],
      [6, 1],
    ]);
    const raices = armarArbol([1, 2, 3, 4, 5, 6], (x) => x, j);
    expect(raices.map((n) => n.item)).toEqual([5, 1]);
    expect(raices[1].hijos.map((n) => n.item)).toEqual([3, 6, 2]);
    expect(raices[1].hijos[2].hijos.map((n) => n.item)).toEqual([4]);
  });
  it("aplanarArbol en preorden con nivel, debajo y plegados", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const filas = aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x);
    expect(filas.map((f) => [f.item, f.nivel, f.debajo])).toEqual([
      [6, 0, 0],
      [1, 0, 4],
      [5, 1, 0],
      [2, 1, 2],
      [3, 2, 0],
      [4, 2, 0],
    ]);
    expect(aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x, new Set([2])).map((f) => f.item)).toEqual([6, 1, 5, 2]);
  });
  it("aplanarConCierres agrega el cierre de cada rama abierta después de su gente", () => {
    const arbol = armarArbol([1, 2, 3, 4, 5, 6], (x) => x, jefes);
    const ver = (plegados?: Set<number>) =>
      aplanarConCierres(arbol, (x) => x, plegados).map((f) => (f.tipo === "cierre" ? `fin ${f.item} (${f.nivel}, ${f.debajo})` : f.item));
    expect(ver()).toEqual([6, 1, 5, 2, 3, 4, "fin 2 (1, 2)", "fin 1 (0, 4)"]);
    expect(ver(new Set([2]))).toEqual([6, 1, 5, 2, "fin 1 (0, 4)"]);
    expect(ver(new Set([1]))).toEqual([6, 1]);
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

describe("acomodarDirectos", () => {
  const hoja = (n: number): NodoArbol<number> => ({ item: n, hijos: [] });
  const equipo = (n: number): NodoArbol<number> => ({ item: n, hijos: [hoja(n * 10)] });
  const sinGente = (n: NodoArbol<number>) => n.hijos.length === 0;
  const forma = (filas: LugarDirecto<number>[][]) =>
    filas.map((f) => f.map((l) => (l.tipo === "rama" ? l.nodo.item : `hojas:${l.nodos.map((n) => n.item).join(",")}/${l.columnas}`)));

  it("sin directos no hay filas", () => {
    expect(acomodarDirectos([], sinGente)).toEqual([]);
  });

  it("pocos lugares van en una sola fila, con las hojas juntas al final", () => {
    expect(forma(acomodarDirectos([hoja(1), equipo(2), hoja(3)], sinGente))).toEqual([[2, "hojas:1,3/1"]]);
    expect(forma(acomodarDirectos([hoja(1), hoja(2)], sinGente))).toEqual([["hojas:1,2/1"]]);
  });

  it("las hojas pasan a 2 columnas desde 4 y a 3 desde 13", () => {
    expect(forma(acomodarDirectos([1, 2, 3, 4].map(hoja), sinGente))).toEqual([["hojas:1,2,3,4/2"]]);
    const trece = Array.from({ length: 13 }, (_, i) => hoja(i + 1));
    expect((acomodarDirectos(trece, sinGente)[0][0] as { columnas: number }).columnas).toBe(3);
  });

  it("con más de 3 lugares se reparten en filas de ⌈√n⌉", () => {
    expect(forma(acomodarDirectos([1, 2, 3, 4].map(equipo), sinGente))).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(forma(acomodarDirectos([...[1, 2, 3, 4, 5].map(equipo), hoja(6)], sinGente))).toEqual([
      [1, 2, 3],
      [4, 5, "hojas:6/1"],
    ]);
  });

  it("lo compacto lo decide quien llama (p. ej. una rama plegada)", () => {
    expect(forma(acomodarDirectos([equipo(1), equipo(2)], (n) => n.item === 2))).toEqual([[1, "hojas:2/1"]]);
  });
});
