import { describe, expect, it } from "vitest";
import { agruparPie, alternarColumna, columnasVisibles, moverColumna, normalizarColumnas } from "./columnas";

const TODAS = ["a", "b", "c", "d"] as const;
type K = (typeof TODAS)[number];

describe("normalizarColumnas", () => {
  it("sin nada guardado usa el orden original, todo visible", () => {
    expect(normalizarColumnas<K>(null, TODAS)).toEqual({
      orden: ["a", "b", "c", "d"],
      ocultas: [],
    });
  });

  it("descarta claves desconocidas o repetidas y agrega las nuevas junto a su vecina original", () => {
    const e = normalizarColumnas<K>({ orden: ["c", "x", "a", "c", "d"], ocultas: ["d", "y"] }, TODAS);
    expect(e).toEqual({ orden: ["c", "a", "b", "d"], ocultas: ["d"] });
  });

  it("una nueva que va primera queda al inicio", () => {
    expect(normalizarColumnas<K>({ orden: ["c", "b", "d"], ocultas: [] }, TODAS).orden).toEqual(["a", "c", "b", "d"]);
  });

  it("ignora datos con forma inválida", () => {
    expect(normalizarColumnas<K>({ orden: "a" } as unknown, TODAS)).toEqual({
      orden: ["a", "b", "c", "d"],
      ocultas: [],
    });
  });

  it("nunca deja todas ocultas", () => {
    expect(normalizarColumnas<K>({ orden: [...TODAS], ocultas: [...TODAS] }, TODAS).ocultas).toEqual([]);
  });
});

describe("cambios", () => {
  const base = normalizarColumnas<K>(null, TODAS);

  it("oculta y vuelve a mostrar, sin ocultar la última visible", () => {
    const e = alternarColumna(alternarColumna(alternarColumna(base, "a"), "b"), "c");
    expect(columnasVisibles(e)).toEqual(["d"]);
    expect(alternarColumna(e, "d")).toBe(e);
    expect(columnasVisibles(alternarColumna(e, "b"))).toEqual(["b", "d"]);
  });

  it("mueve una columna y no se sale de los bordes", () => {
    expect(moverColumna(base, "b", -1).orden).toEqual(["b", "a", "c", "d"]);
    expect(moverColumna(base, "b", 1).orden).toEqual(["a", "c", "b", "d"]);
    expect(moverColumna(base, "a", -1)).toBe(base);
    expect(moverColumna(base, "d", 1)).toBe(base);
  });
});

describe("agruparPie", () => {
  it("junta las columnas sin total y pone la etiqueta en el primer grupo", () => {
    expect(agruparPie(["chk", "fecha", "banco", "bs", "tasa", "usd", "obs"], ["bs", "usd"])).toEqual([
      { tipo: "etiqueta", span: 3 },
      { tipo: "total", col: "bs" },
      { tipo: "vacio", span: 1 },
      { tipo: "total", col: "usd" },
      { tipo: "vacio", span: 1 },
    ]);
  });

  it("si empieza con un total la etiqueta va en el primer hueco que haya", () => {
    expect(agruparPie(["usd", "fecha"], ["usd"])).toEqual([
      { tipo: "total", col: "usd" },
      { tipo: "etiqueta", span: 1 },
    ]);
  });
});
