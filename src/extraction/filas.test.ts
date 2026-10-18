import { describe, expect, it } from "vitest";
import { agruparFilas, contiene, valorDebajo, valorDeEtiqueta } from "./filas";
import type { OcrLinea, OcrResultado } from "./ocr/types";

/** Una línea cuyas palabras se reparten el ancho a partes iguales. */
function linea(texto: string, x: number, y: number, w = 100, h = 20): OcrLinea {
  const tokens = texto.split(" ");
  const pw = w / tokens.length;
  return {
    texto,
    caja: { x, y, w, h },
    palabras: tokens.map((t, i) => ({ texto: t, caja: { x: x + i * pw, y, w: pw, h } })),
  };
}

const ocr = (...lineas: OcrLinea[]): OcrResultado => ({ lineas, ancho: 1000, alto: 1000 });
const textos = (r: OcrResultado) => agruparFilas(r).map((f) => f.texto);

describe("agruparFilas", () => {
  it("une etiqueta y valor que están a la misma altura", () => {
    expect(textos(ocr(linea("Fecha:", 10, 100), linea("15/10/2026", 300, 102)))).toEqual(["Fecha: 15/10/2026"]);
  });

  it("ordena filas de arriba abajo y cada fila de izquierda a derecha", () => {
    const r = ocr(linea("B2", 300, 200), linea("A", 10, 100), linea("B1", 10, 201), linea("C", 10, 300));
    expect(textos(r)).toEqual(["A", "B1 B2", "C"]);
  });

  it("no une líneas que se solapan menos de la mitad de la altura menor", () => {
    expect(textos(ocr(linea("uno", 10, 100), linea("dos", 300, 115)))).toEqual(["uno", "dos"]);
  });

  it("la caja de la fila es la unión de sus líneas", () => {
    const [f] = agruparFilas(ocr(linea("Fecha:", 10, 100, 50, 20), linea("15/10/2026", 300, 104, 100, 20)));
    expect(f.caja).toEqual({ x: 10, y: 100, w: 390, h: 24 });
    expect(f.lineas).toHaveLength(2);
  });
});

describe("valorDeEtiqueta", () => {
  const filas = (...t: string[]) => agruparFilas(ocr(...t.map((s, i) => linea(s, 10, i * 100))));

  it("ignora acentos, mayúsculas y los dos puntos", () => {
    expect(valorDeEtiqueta(filas("OPERACION: 059132331406"), "Operación")).toBe("059132331406");
    expect(valorDeEtiqueta(filas("Operación : 059132331406"), "Operación")).toBe("059132331406");
    expect(valorDeEtiqueta(filas("Operación:059132331406"), "Operación")).toBe("059132331406");
  });

  it("admite etiquetas de varias palabras", () => {
    expect(valorDeEtiqueta(filas("Cuenta destino: 0102"), "Cuenta destino")).toBe("0102");
  });

  it("devuelve null si no hay fila o si no hay valor", () => {
    expect(valorDeEtiqueta(filas("Nombre: Ana"), "Fecha")).toBeNull();
    expect(valorDeEtiqueta(filas("Fecha:"), "Fecha")).toBeNull();
  });

  it("no confunde una etiqueta con el comienzo de otra palabra", () => {
    expect(valorDeEtiqueta(filas("Fechas: 1"), "Fecha")).toBeNull();
  });

  it("valorDebajo toma la fila siguiente a la etiqueta sola", () => {
    expect(valorDebajo(filas("NÚMERO DE REFERENCIA", "62914564099"), "Número de referencia")).toBe("62914564099");
    expect(valorDebajo(filas("Monto (Bs.):", "20.000,00"), "Monto (Bs.)")).toBe("20.000,00");
  });

  it("valorDebajo exige que la etiqueta ocupe toda la fila", () => {
    expect(valorDebajo(filas("Fecha: 15/10/2026", "Otra"), "Fecha")).toBeNull();
    expect(valorDebajo(filas("Fecha"), "Fecha")).toBeNull();
  });

  it("contiene busca sin acentos ni espacios", () => {
    expect(contiene(filas("Transferencias a terceros BDV"), "Transferencias a terceros")).toBe(true);
    expect(contiene(filas("TASA DEL DIA"), "Tasa del día")).toBe(true);
    expect(contiene(filas("Pago móvil"), "Transferencias")).toBe(false);
  });
});
