import { expect, it } from "vitest";
import { leerZoomGuardado, siguienteZoom } from "./zoomApp";

it("siguienteZoom avanza por pasos y se detiene en los extremos", () => {
  expect(siguienteZoom(1, 1)).toBe(1.1);
  expect(siguienteZoom(1, -1)).toBe(0.9);
  expect(siguienteZoom(2, 1)).toBe(2);
  expect(siguienteZoom(0.5, -1)).toBe(0.5);
});

it("siguienteZoom desde un valor fuera de la lista va al paso vecino", () => {
  expect(siguienteZoom(1.05, 1)).toBe(1.1);
  expect(siguienteZoom(1.05, -1)).toBe(1);
});

it("leerZoomGuardado acepta solo valores dentro del rango", () => {
  expect(leerZoomGuardado("1.25")).toBe(1.25);
  expect(leerZoomGuardado(null)).toBe(1);
  expect(leerZoomGuardado("abc")).toBe(1);
  expect(leerZoomGuardado("9")).toBe(1);
});
