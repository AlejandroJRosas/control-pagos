import { describe, expect, it } from "vitest";
import { COLORES_ETIQUETA, conEtiquetas, idsDeFiltro, filtroDeIds, validateEtiqueta } from "./etiquetas";

describe("validateEtiqueta", () => {
  it("exige nombre y un color de la paleta", () => {
    expect(validateEtiqueta({ nombre: "  ", color: "azul" })).toEqual({ ok: false, errors: { nombre: "Indica el nombre" } });
    expect(validateEtiqueta({ nombre: "VIP", color: "fucsia" })).toEqual({ ok: false, errors: { color: "Elige un color" } });
    expect(validateEtiqueta({ nombre: " VIP ", color: "verde" })).toEqual({ ok: true, value: { nombre: "VIP", color: "verde" } });
  });

  it("limita el largo del nombre", () => {
    expect(validateEtiqueta({ nombre: "x".repeat(31), color: "gris" }).ok).toBe(false);
  });

  it("la paleta no repite colores", () => {
    expect(new Set(COLORES_ETIQUETA).size).toBe(COLORES_ETIQUETA.length);
  });
});

describe("filtro de etiquetas en la URL", () => {
  it("lee ids separados por coma e ignora lo inválido", () => {
    expect(idsDeFiltro("")).toEqual([]);
    expect(idsDeFiltro("3,x,1,3")).toEqual([3, 1]);
  });

  it("escribe los ids ordenados", () => {
    expect(filtroDeIds([5, 2])).toBe("2,5");
    expect(filtroDeIds([])).toBe("");
  });
});

describe("conEtiquetas", () => {
  it("sin selección todo coincide; con selección, basta una de ellas", () => {
    expect(conEtiquetas([], [])).toBe(true);
    expect(conEtiquetas([1, 2], [])).toBe(true);
    expect(conEtiquetas([1, 2], [2, 9])).toBe(true);
    expect(conEtiquetas([1], [2])).toBe(false);
    expect(conEtiquetas([], [2])).toBe(false);
  });
});
