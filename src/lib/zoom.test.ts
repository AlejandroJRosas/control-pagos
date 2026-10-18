import { expect, it } from "vitest";
import { escalaMaxima, limitarPan, VISTA_AJUSTADA, zoomEnPunto } from "./zoom";

it("acerca dejando fijo el punto del cursor", () => {
  expect(zoomEnPunto(VISTA_AJUSTADA, 2, 100, 50, 8)).toEqual({ escala: 2, x: -100, y: -50 });
  // Desde una vista ya desplazada: el punto bajo el cursor sigue bajo el cursor.
  const v = { escala: 2, x: -100, y: -50 };
  const w = zoomEnPunto(v, 1.5, 40, 30, 8);
  expect(w.escala).toBe(3);
  expect((40 - w.x) / w.escala).toBeCloseTo((40 - v.x) / v.escala);
  expect((30 - w.y) / w.escala).toBeCloseTo((30 - v.y) / v.escala);
});

it("al alejar no baja de la vista ajustada", () => {
  expect(zoomEnPunto({ escala: 1.2, x: -10, y: -5 }, 0.5, 0, 0, 8)).toEqual(VISTA_AJUSTADA);
  expect(zoomEnPunto(VISTA_AJUSTADA, 0.8, 50, 50, 8)).toEqual(VISTA_AJUSTADA);
});

it("no pasa de la escala máxima", () => {
  expect(zoomEnPunto({ escala: 7, x: 0, y: 0 }, 2, 0, 0, 8).escala).toBe(8);
});

it("limitarPan no deja ver fuera de la imagen", () => {
  const cont = { w: 200, h: 100 };
  expect(limitarPan({ escala: 2, x: 50, y: 20 }, cont)).toEqual({ escala: 2, x: 0, y: 0 });
  expect(limitarPan({ escala: 2, x: -500, y: -300 }, cont)).toEqual({ escala: 2, x: -200, y: -100 });
  expect(limitarPan({ escala: 2, x: -120, y: -40 }, cont)).toEqual({ escala: 2, x: -120, y: -40 });
});

it("escala máxima = 400 % del tamaño real, y nunca menos que la ajustada", () => {
  expect(escalaMaxima({ w: 1000, h: 2000 }, { w: 500, h: 1000 })).toBe(8);
  expect(escalaMaxima({ w: 100, h: 100 }, { w: 500, h: 500 })).toBe(1);
});
