import { describe, expect, it } from "vitest";
import { calcResumen } from "@/domain/campanaView";
import { COLOR, anchoBarra, argb, colorBarra, hex, textoRestante } from "./estilo";

const res = (asignado: string, pagado: string, cantidad: number) =>
  calcResumen(asignado, cantidad === 0 ? [] : [pagado], cantidad === 0 ? [] : ["2026-03-01"]);

describe("colorBarra", () => {
  it("verde si está completo, rojo si se pasó, ámbar bajo 50 % y azul en el resto", () => {
    expect(colorBarra(res("100", "100", 1))).toBe(COLOR.verde);
    expect(colorBarra(res("100", "120", 1))).toBe(COLOR.rojo);
    expect(colorBarra(res("100", "49", 1))).toBe(COLOR.ambar);
    expect(colorBarra(res("100", "0", 0))).toBe(COLOR.ambar);
    expect(colorBarra(res("100", "50", 1))).toBe(COLOR.barraAzul);
  });
});

it("anchoBarra queda entre 0 y 1", () => {
  expect(anchoBarra(res("100", "120", 1))).toBe(1);
  expect(anchoBarra(res("0", "0", 0))).toBe(0);
  expect(anchoBarra(res("200", "50", 1))).toBe(0.25);
});

it("textoRestante distingue lo que falta de lo pagado de más", () => {
  expect(textoRestante(res("100", "120", 1))).toEqual({ etiqueta: "Pagado de más", monto: "$ 20,00", excedido: true });
  expect(textoRestante(res("100", "30", 1))).toEqual({ etiqueta: "Faltan", monto: "$ 70,00", excedido: false });
});

it("convierte colores para Excel y pdfmake", () => {
  expect(argb("1f3a5f")).toBe("FF1F3A5F");
  expect(hex("1f3a5f")).toBe("#1f3a5f");
});
