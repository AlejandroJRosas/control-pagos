import { describe, expect, it } from "vitest";
import { agruparFilas, type Fila } from "../filas";
import { normalizarDeposito, normalizarTasa } from "../normalizar";
import type { OcrResultado } from "../ocr/types";
import { bdvTransferenciaTerceros } from "./bdvTransferenciaTerceros";
import { tasaMariandres } from "./tasaMariandres";
import { reconocedoresDeposito, reconocedoresTasa } from "./index";
import bdvOscuro from "./__fixtures__/bdv-oscuro.json";
import bdvClaro from "./__fixtures__/bdv-claro.json";
import bdvRecortada from "./__fixtures__/bdv-recortada.json";
import tasaFixture from "./__fixtures__/tasa-mariandres.json";

const HOY = "2026-10-18";
const filasDe = (r: OcrResultado) => agruparFilas(r);
const valores = (p: Partial<Record<string, { value: string }>>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v?.value]));

/** Filas sintéticas, una por texto, como las daría agruparFilas. */
const filas = (...textos: string[]): Fila[] =>
  textos.map((texto, i) => {
    const caja = { x: 0, y: i * 100, w: 500, h: 40 };
    return { texto, caja, lineas: [{ texto, caja, palabras: [{ texto, caja }] }] };
  });

const BANCO = "Banco de Venezuela";
const CUENTA = "M A Colecciones 2006 Ca";

describe("bdv-transferencia-terceros con capturas reales", () => {
  it.each([
    ["oscuro", bdvOscuro, { montoBs: "13.186,80", fecha: "2026-10-15", referencia: "059132331406", banco: BANCO, cuentaDestino: CUENTA }],
    // Captura borrosa: el OCR pierde la "M" del nombre (limitación conocida, no detectable).
    ["claro", bdvClaro, { montoBs: "17.200,00", fecha: "2026-10-15", referencia: "059132356290", banco: BANCO, cuentaDestino: "A Colecciones 2006 Ca" }],
    ["recortada", bdvRecortada, { montoBs: "22.880,00", fecha: "2026-10-15", referencia: "059132357798", banco: BANCO, cuentaDestino: CUENTA }],
  ])("%s", (_, fixture, esperado) => {
    const f = filasDe(fixture);
    expect(bdvTransferenciaTerceros.detecta(f)).toBe(true);
    expect(valores(normalizarDeposito(bdvTransferenciaTerceros.extrae(f), HOY))).toEqual(esperado);
  });

  it("la fecha que el OCR leyó con la barra como 1 se repara, pero queda para revisar", () => {
    const p = normalizarDeposito(bdvTransferenciaTerceros.extrae(filasDe(bdvOscuro)), HOY);
    expect(p.fecha).toEqual({ value: "2026-10-15", confidence: 0.7 });
  });
});

describe("tasa-mariandres con la imagen real", () => {
  it("lee valor y fecha aunque el OCR no lea bien el 'bs.'", () => {
    const f = filasDe(tasaFixture);
    expect(tasaMariandres.detecta(f)).toBe(true);
    expect(valores(normalizarTasa(tasaMariandres.extrae(f), HOY))).toEqual({ valor: "880,12", fecha: "2026-10-16" });
  });
});

describe("tasa-mariandres con texto sintético", () => {
  it.each([
    ["bs. 1050,25", "1050,25"],
    ["Ds. 1.050,25", "1.050,25"],
    ["880,12", "880,12"],
  ])("toma el número completo de %j", (fila, esperado) => {
    expect(tasaMariandres.extrae(filas("TASA DEL DÍA", "16/10/2026", fila)).valor).toEqual({ texto: esperado, certeza: "etiqueta" });
  });
});

describe("detección", () => {
  it("cada reconocedor detecta solo sus imágenes", () => {
    expect(bdvTransferenciaTerceros.detecta(filasDe(tasaFixture))).toBe(false);
    for (const r of [bdvOscuro, bdvClaro, bdvRecortada]) expect(tasaMariandres.detecta(filasDe(r))).toBe(false);
  });

  it("no detecta una captura cualquiera", () => {
    const f = filas("Hola", "Pago listo 15$");
    expect(bdvTransferenciaTerceros.detecta(f)).toBe(false);
    expect(tasaMariandres.detecta(f)).toBe(false);
  });

  it("el registro incluye los formatos", () => {
    expect(reconocedoresDeposito).toContain(bdvTransferenciaTerceros);
    expect(reconocedoresTasa).toContain(tasaMariandres);
  });
});

describe("bdv-transferencia-terceros con texto sintético", () => {
  const base = (operacion = "Operación: 059132331406") =>
    filas("Transferencias a terceros", "13.186,80 Bs", "Fecha: 15/10/2026", operacion, "Nombre: M A Colecciones 2006 Ca", "Ana Pérez 15$");

  it("el monto sale de la fila con Bs, no de un número con $", () => {
    expect(bdvTransferenciaTerceros.extrae(base()).montoBs).toEqual({ texto: "13.186,80", certeza: "etiqueta" });
  });

  it("ignora el ícono de copiar leído como carácter suelto", () => {
    expect(bdvTransferenciaTerceros.extrae(base("Operación: 059132331406 D")).referencia).toEqual({ texto: "059132331406", certeza: "etiqueta" });
  });

  it("una referencia que no mide 12 dígitos queda como heurística", () => {
    expect(bdvTransferenciaTerceros.extrae(base("Operación: 0591323314060")).referencia).toEqual({ texto: "0591323314060", certeza: "heuristica" });
  });

  it("sin la etiqueta Operación toma la corrida de 12 dígitos como heurística", () => {
    const f = filas("Transferencias a terceros", "13.186,80 Bs", "Fecha: 15/10/2026", "059132331406 (Ü", "Nombre: X", "Destino: 0102");
    expect(bdvTransferenciaTerceros.extrae(f).referencia).toEqual({ texto: "059132331406", certeza: "heuristica" });
  });

  it("un monto con punto en lugar de coma decimal se repara como heurística", () => {
    const f = filas("Transferencias a terceros", "17.200.00 Bs", "Nombre: X", "Destino: 0102");
    expect(bdvTransferenciaTerceros.extrae(f).montoBs).toEqual({ texto: "17.200,00", certeza: "heuristica" });
  });

  it("sin la etiqueta Fecha toma la primera fecha como heurística", () => {
    const f = filas("Transferencias a terceros", "15/10/2026", "Nombre: X", "Destino: 0102");
    expect(bdvTransferenciaTerceros.extrae(f).fecha).toEqual({ texto: "15/10/2026", certeza: "heuristica" });
  });
});
