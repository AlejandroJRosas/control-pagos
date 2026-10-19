import { describe, expect, it } from "vitest";
import { alternarBarra, barraColapsada, type EstadoBarra } from "./barraLateral";

const e = (pref: EstadoBarra["pref"], abiertaAMano = false): EstadoBarra => ({ pref, abiertaAMano });

describe("barraColapsada", () => {
  it("en automático se colapsa solo cuando la ventana es angosta", () => {
    expect(barraColapsada(e("auto"), false)).toBe(false);
    expect(barraColapsada(e("auto"), true)).toBe(true);
  });

  it("abierta a mano se queda abierta aunque la ventana sea angosta", () => {
    expect(barraColapsada(e("auto", true), true)).toBe(false);
  });

  it("cerrada por el usuario se queda cerrada con cualquier ancho", () => {
    expect(barraColapsada(e("cerrada"), false)).toBe(true);
    expect(barraColapsada(e("cerrada"), true)).toBe(true);
  });
});

describe("alternarBarra", () => {
  it("cerrarla la deja cerrada (se recuerda)", () => {
    expect(alternarBarra(e("auto"), false)).toEqual(e("cerrada"));
    expect(alternarBarra(e("auto", true), true)).toEqual(e("cerrada"));
  });

  it("abrirla vuelve a automático; en ventana angosta queda abierta a mano", () => {
    expect(alternarBarra(e("cerrada"), false)).toEqual(e("auto"));
    expect(alternarBarra(e("cerrada"), true)).toEqual(e("auto", true));
    expect(alternarBarra(e("auto"), true)).toEqual(e("auto", true));
  });
});
