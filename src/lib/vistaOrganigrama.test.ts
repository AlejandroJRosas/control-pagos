import { describe, expect, it } from "vitest";
import { ajustarVista, ESCALA_MAX, ESCALA_MIN, limitarVista, normalizarVista, zoomVista } from "./vistaOrganigrama";

const marco = { w: 1000, h: 500 };

describe("ajustarVista", () => {
  it("un dibujo que entra queda al 100 % y centrado a lo ancho", () => {
    expect(ajustarVista(marco, { w: 600, h: 300 })).toEqual({ escala: 1, x: 200, y: 0 });
  });

  it("uno muy ancho se achica para entrar", () => {
    expect(ajustarVista(marco, { w: 2000, h: 400 })).toEqual({ escala: 0.5, x: 0, y: 0 });
  });

  it("uno muy alto se achica por la altura y se centra", () => {
    expect(ajustarVista(marco, { w: 500, h: 1000 })).toEqual({ escala: 0.5, x: 375, y: 0 });
  });

  it("no baja de la escala mínima ni falla sin medidas", () => {
    expect(ajustarVista(marco, { w: 100_000, h: 100 }).escala).toBe(ESCALA_MIN);
    expect(ajustarVista(marco, { w: 0, h: 0 })).toEqual({ escala: 1, x: 0, y: 0 });
  });
});

describe("limitarVista", () => {
  it("si el dibujo entra, no sale del marco", () => {
    expect(limitarVista({ escala: 1, x: -50, y: 900 }, marco, { w: 600, h: 300 })).toEqual({ escala: 1, x: 0, y: 200 });
  });

  it("si es más grande, no deja hueco a los lados", () => {
    expect(limitarVista({ escala: 1, x: 100, y: -5000 }, marco, { w: 2000, h: 800 })).toEqual({ escala: 1, x: 0, y: -300 });
    expect(limitarVista({ escala: 1, x: -400, y: -100 }, marco, { w: 2000, h: 800 })).toEqual({ escala: 1, x: -400, y: -100 });
  });

  it("acota la escala", () => {
    expect(limitarVista({ escala: 9, x: 0, y: 0 }, marco, { w: 10, h: 10 }).escala).toBe(ESCALA_MAX);
  });
});

describe("zoomVista", () => {
  it("deja fijo el punto del cursor", () => {
    const v = zoomVista({ escala: 1, x: 0, y: 0 }, 2, 100, 50);
    expect(v).toEqual({ escala: 2, x: -100, y: -50 });
    // el punto (100, 50) del marco sigue mostrando el mismo punto del dibujo: (100 - x) / escala
    expect((100 - v.x) / v.escala).toBe(100);
  });

  it("no pasa de los límites", () => {
    expect(zoomVista({ escala: 1.5, x: 0, y: 0 }, 4, 0, 0).escala).toBe(ESCALA_MAX);
    expect(zoomVista({ escala: 0.3, x: 0, y: 0 }, 0.1, 0, 0).escala).toBe(ESCALA_MIN);
  });
});

describe("normalizarVista", () => {
  it("acepta una vista guardada y rechaza basura", () => {
    expect(normalizarVista({ escala: 0.8, x: -10, y: 4 })).toEqual({ escala: 0.8, x: -10, y: 4 });
    expect(normalizarVista({ escala: "1", x: 0, y: 0 })).toBeNull();
    expect(normalizarVista({ escala: 0, x: 0, y: 0 })).toBeNull();
    expect(normalizarVista(null)).toBeNull();
    expect(normalizarVista([1, 2])).toBeNull();
  });
});
