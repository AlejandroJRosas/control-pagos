import { describe, expect, it } from "vitest";
import { posicionTarjeta } from "./tutorial";

describe("posicionTarjeta", () => {
  const ventana = { width: 1000, height: 800 };
  const tarjeta = { width: 300, height: 200 };

  it("sin elemento va al centro", () => {
    expect(posicionTarjeta(null, tarjeta, ventana)).toEqual({ top: 300, left: 350 });
  });

  it("debajo del elemento si cabe, centrada y dentro de la ventana", () => {
    expect(posicionTarjeta({ top: 50, left: 450, width: 100, height: 40 }, tarjeta, ventana)).toEqual({ top: 106, left: 350 });
    expect(posicionTarjeta({ top: 50, left: 950, width: 40, height: 40 }, tarjeta, ventana)).toEqual({ top: 106, left: 684 });
  });

  it("arriba si abajo no cabe", () => {
    expect(posicionTarjeta({ top: 700, left: 450, width: 100, height: 40 }, tarjeta, ventana)).toEqual({ top: 484, left: 350 });
  });

  it("al lado de un elemento alto (la barra lateral)", () => {
    expect(posicionTarjeta({ top: 0, left: 0, width: 220, height: 800 }, tarjeta, ventana)).toEqual({ top: 300, left: 236 });
  });
});
