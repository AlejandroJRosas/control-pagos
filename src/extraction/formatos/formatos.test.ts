import { describe, expect, it } from "vitest";
import { agruparFilas, type Fila } from "../filas";
import { normalizarDeposito, normalizarTasa } from "../normalizar";
import type { OcrResultado } from "../ocr/types";
import type { Reconocedor } from "../tipos";
import { bdvTransferenciaTerceros } from "./bdvTransferenciaTerceros";
import { tasaMariandres } from "./tasaMariandres";
import { banescoOperacion } from "./banescoOperacion";
import { mercantilSolicitud } from "./mercantilSolicitud";
import { bncMovimiento } from "./bncMovimiento";
import { bdtTransferencia } from "./bdtTransferencia";
import { bdvOperacion } from "./bdvOperacion";
import { reconocedoresDeposito, reconocedoresTasa } from "./index";
import bdvOscuro from "./__fixtures__/bdv-oscuro.json";
import bdvClaro from "./__fixtures__/bdv-claro.json";
import bdvRecortada from "./__fixtures__/bdv-recortada.json";
import bdvEnvuelta1 from "./__fixtures__/bdv-envuelta-1.json";
import bdvEnvuelta2 from "./__fixtures__/bdv-envuelta-2.json";
import tasaFixture from "./__fixtures__/tasa-mariandres.json";
import banescoFixture from "./__fixtures__/banesco.json";
import mercantilFixture from "./__fixtures__/mercantil.json";
import bncFixture from "./__fixtures__/bnc.json";
import bdtFixture from "./__fixtures__/bdt.json";
import bdvOperacionFixture from "./__fixtures__/bdv-operacion.json";

const HOY = "2026-10-18";
const filasDe = (r: OcrResultado) => agruparFilas(r);
const valores = (p: Partial<Record<string, { value: string }>>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v?.value]));

/** Filas sintéticas, una por texto, como las daría agruparFilas. */
const filas = (...textos: string[]): Fila[] =>
  textos.map((texto, i) => {
    const caja = { x: 0, y: i * 100, w: 500, h: 40 };
    return { texto, caja, lineas: [{ texto, caja, palabras: [{ texto, caja }] }] };
  });

const BANCO = "Venezuela";
const CUENTA = "M A Colecciones 2006 Ca";

describe("bdv-transferencia-terceros con capturas reales", () => {
  it.each([
    ["oscuro", bdvOscuro, { montoBs: "13.186,80", fecha: "2026-10-15", referencia: "059132331406", banco: BANCO, cuentaDestino: CUENTA }],
    // Captura borrosa: el OCR pierde la "M" del nombre (limitación conocida, no detectable).
    ["claro", bdvClaro, { montoBs: "17.200,00", fecha: "2026-10-15", referencia: "059132356290", banco: BANCO, cuentaDestino: "A Colecciones 2006 Ca" }],
    ["recortada", bdvRecortada, { montoBs: "22.880,00", fecha: "2026-10-15", referencia: "059132357798", banco: BANCO, cuentaDestino: CUENTA }],
    // Pantalla angosta: la operación sigue en la fila de abajo y el nombre va debajo de su etiqueta (el OCR pierde "M A").
    ["envuelta 1", bdvEnvuelta1, { montoBs: "22.857,22", fecha: "2026-10-14", referencia: "059130685662", banco: BANCO, cuentaDestino: "Colecciones 2006 ca" }],
    ["envuelta 2", bdvEnvuelta2, { montoBs: "21.122,78", fecha: "2026-10-16", referencia: "059134555133", banco: BANCO, cuentaDestino: "Colecciones 2006 ca" }],
  ])("%s", (_, fixture, esperado) => {
    const f = filasDe(fixture);
    expect(bdvTransferenciaTerceros.detecta(f)).toBe(true);
    expect(valores(normalizarDeposito(bdvTransferenciaTerceros.extrae(f), HOY))).toEqual(esperado);
  });

  it("la fecha que el OCR leyó con la barra como 1 se repara, pero queda para revisar", () => {
    const p = normalizarDeposito(bdvTransferenciaTerceros.extrae(filasDe(bdvOscuro)), HOY);
    expect(p.fecha).toEqual({ value: "2026-10-15", confidence: 0.7 });
  });

  it("en la pantalla angosta la referencia unida es segura y el nombre de varias filas queda para revisar", () => {
    const r = bdvTransferenciaTerceros.extrae(filasDe(bdvEnvuelta1));
    expect(r.referencia).toEqual({ texto: "059130685662", certeza: "etiqueta" });
    expect(r.cuentaDestino?.certeza).toBe("heuristica");
  });
});

describe("banesco y mercantil con capturas reales", () => {
  it("banesco: el monto viene con \"Bs.\" delante y el destino es el beneficiario", () => {
    const f = filasDe(banescoFixture);
    expect(banescoOperacion.detecta(f)).toBe(true);
    expect(valores(normalizarDeposito(banescoOperacion.extrae(f), HOY))).toEqual({
      montoBs: "431.724,30",
      fecha: "2026-10-18",
      referencia: "62914564099",
      banco: "Banesco",
      cuentaDestino: "INVERSIONES MARI...S CA INVERSIONES",
    });
  });

  it("mercantil: el destino es la cuenta y la fecha con un espacio de más se repara", () => {
    const f = filasDe(mercantilFixture);
    expect(mercantilSolicitud.detecta(f)).toBe(true);
    const p = normalizarDeposito(mercantilSolicitud.extrae(f), HOY);
    expect(valores(p)).toEqual({ montoBs: "20.000,00", fecha: "2026-10-16", referencia: "20443244320", banco: "Mercantil", cuentaDestino: "01020145420002478546" });
    expect(p.fecha).toEqual({ value: "2026-10-16", confidence: 0.7 });
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

describe("bnc-movimiento", () => {
  it("captura real: el OCR pierde la fecha y la etiqueta Referencia; la referencia es la fila de dígitos antes de Monto", () => {
    const f = filasDe(bncFixture);
    expect(bncMovimiento.detecta(f)).toBe(true);
    const r = bncMovimiento.extrae(f);
    expect(valores(normalizarDeposito(r, HOY))).toEqual({ montoBs: "386.715,93", referencia: "931491184", banco: "BNC", cuentaDestino: "584141234567" });
    expect(r.referencia?.certeza).toBe("heuristica");
  });

  it("con todas las etiquetas: fecha y referencia por etiqueta", () => {
    const f = filas(
      "App BNC - Datos compartido de movimiento",
      "Comprobante de la Operación",
      "Fecha/Hora:",
      "19/10/2026 11:42:28 a. m.",
      "Descripción:",
      "Cargo Pago Movil BNC",
      "Referencia:",
      "931491184",
      "Monto:",
      "386.715,93",
      "Detalle de la Operación:",
      "TELF.:584141234567 CED.:011223344 BANCO:0172",
    );
    const r = bncMovimiento.extrae(f);
    expect(r.fecha).toEqual({ texto: "19/10/2026", certeza: "etiqueta" });
    expect(r.referencia).toEqual({ texto: "931491184", certeza: "etiqueta" });
    expect(r.cuentaDestino).toEqual({ texto: "584141234567", certeza: "etiqueta" });
  });
});

describe("bdt-transferencia", () => {
  it("captura real: la fecha va con guiones y el destino es el beneficiario", () => {
    const f = filasDe(bdtFixture);
    expect(bdtTransferencia.detecta(f)).toBe(true);
    const r = bdtTransferencia.extrae(f);
    expect(valores(normalizarDeposito(r, HOY))).toEqual({
      montoBs: "117.125,16",
      fecha: "2026-10-15",
      referencia: "82861657",
      banco: "Banco Digital de los Trabajadores",
      cuentaDestino: "ANA PEREZ GOMEZ",
    });
    expect(r.fecha).toEqual({ texto: "15/10/2026", certeza: "etiqueta" });
  });

  it("un monto con punto en lugar de coma decimal se repara como heurística", () => {
    const f = filas("Banco Digital de los Trabajadores", "Número de referencia: 1234", "Monto Bs: 117.125.16");
    expect(bdtTransferencia.extrae(f).montoBs).toEqual({ texto: "117.125,16", certeza: "heuristica" });
  });
});

describe("bdv-operacion", () => {
  it("captura real: no trae fecha; la operación va en el texto y el destino es la cuenta", () => {
    const f = filasDe(bdvOperacionFixture);
    expect(bdvOperacion.detecta(f)).toBe(true);
    const r = bdvOperacion.extrae(f);
    expect(valores(normalizarDeposito(r, HOY))).toEqual({
      montoBs: "1.235.910,00",
      referencia: "0591323718037",
      banco: BANCO,
      cuentaDestino: "0102014542000247",
    });
    // La app corta la cuenta destino: queda para revisar.
    expect(r.cuentaDestino?.certeza).toBe("heuristica");
  });

  it("en pantalla ancha las etiquetas van en una fila con su valor", () => {
    const f = filas(
      "BDVenlínea personas",
      "Tu transferencia de fondos ha sido realizada con éxito. El número de operación es 059132371803",
      "Instrumento Origen: 0102***0493",
      "Instrumento Destino: 01020145420002478546",
      "Monto Operación: 1.235.910,00",
    );
    expect(bdvOperacion.extrae(f)).toEqual({
      banco: { texto: "Venezuela", certeza: "constante" },
      montoBs: { texto: "1.235.910,00", certeza: "etiqueta" },
      referencia: { texto: "059132371803", certeza: "etiqueta" },
      cuentaDestino: { texto: "01020145420002478546", certeza: "etiqueta" },
    });
  });
});

describe("detección", () => {
  it("cada reconocedor detecta solo sus imágenes", () => {
    const propias = new Map<Reconocedor<string>, OcrResultado[]>([
      [bdvTransferenciaTerceros, [bdvOscuro, bdvClaro, bdvRecortada, bdvEnvuelta1, bdvEnvuelta2]],
      [banescoOperacion, [banescoFixture]],
      [mercantilSolicitud, [mercantilFixture]],
      [bncMovimiento, [bncFixture]],
      [bdtTransferencia, [bdtFixture]],
      [bdvOperacion, [bdvOperacionFixture]],
      [tasaMariandres, [tasaFixture]],
    ]);
    const todas = [...propias.values()].flat();
    for (const [r, suyas] of propias) for (const img of todas) expect(r.detecta(filasDe(img))).toBe(suyas.includes(img));
  });

  it("no detecta una captura cualquiera", () => {
    const f = filas("Hola", "Pago listo 15$");
    expect(bdvTransferenciaTerceros.detecta(f)).toBe(false);
    expect(tasaMariandres.detecta(f)).toBe(false);
    expect(banescoOperacion.detecta(f)).toBe(false);
    expect(mercantilSolicitud.detecta(f)).toBe(false);
    expect(bncMovimiento.detecta(f)).toBe(false);
    expect(bdtTransferencia.detecta(f)).toBe(false);
    expect(bdvOperacion.detecta(f)).toBe(false);
  });

  it("el registro incluye los formatos", () => {
    expect(reconocedoresDeposito).toEqual(expect.arrayContaining([bdvTransferenciaTerceros, banescoOperacion, mercantilSolicitud, bncMovimiento, bdtTransferencia, bdvOperacion]));
    expect(reconocedoresTasa).toContain(tasaMariandres);
  });
});

describe("bdv-transferencia-terceros con texto sintético", () => {
  const base = (...operacion: string[]) =>
    filas("Transferencias a terceros", "13.186,80 Bs", "Fecha: 15/10/2026", ...(operacion.length ? operacion : ["Operación: 059132331406"]), "Nombre: M A Colecciones 2006 Ca", "Ana Pérez 15$");

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

  it("une la operación partida en dos filas solo si suma 12 dígitos", () => {
    expect(bdvTransferenciaTerceros.extrae(base("Operación: 059132331", "406")).referencia).toEqual({ texto: "059132331406", certeza: "etiqueta" });
    expect(bdvTransferenciaTerceros.extrae(base("Operación: 059132331", "40")).referencia).toEqual({ texto: "059132331", certeza: "heuristica" });
  });

  it("el nombre debajo de la etiqueta llega hasta la siguiente etiqueta", () => {
    const f = filas("Transferencias a terceros", "Nombre:", "M A", "Colecciones", "Origen: 0102 5112", "Destino: 0102 8546");
    expect(bdvTransferenciaTerceros.extrae(f).cuentaDestino).toEqual({ texto: "M A Colecciones", certeza: "heuristica" });
  });

  it("sin la etiqueta Fecha toma la primera fecha como heurística", () => {
    const f = filas("Transferencias a terceros", "15/10/2026", "Nombre: X", "Destino: 0102");
    expect(bdvTransferenciaTerceros.extrae(f).fecha).toEqual({ texto: "15/10/2026", certeza: "heuristica" });
  });
});

describe("banesco y mercantil con texto sintético", () => {
  it("mercantil: una fecha bien leída queda con la certeza de la etiqueta", () => {
    const f = filas("Cuenta origen:", "0010 - Ana", "Fecha y hora de envío:", "16/10/2026 a las 2:23:02 PM", "Nro. de referencia:", "1");
    expect(mercantilSolicitud.extrae(f).fecha).toEqual({ texto: "16/10/2026", certeza: "etiqueta" });
  });

  it("banesco: un monto con punto en lugar de coma decimal se repara como heurística", () => {
    const f = filas("DESDE MI CUENTA", "Cuenta Corriente", "MONTO", "Bs. 431.724.30");
    expect(banescoOperacion.extrae(f).montoBs).toEqual({ texto: "431.724,30", certeza: "heuristica" });
  });

  it("sin la etiqueta \"Desde mi cuenta\" no es Banesco, ni sin \"Cuenta origen\" es Mercantil", () => {
    expect(banescoOperacion.detecta(filas("NÚMERO DE REFERENCIA", "1", "BENEFICIARIO", "X", "MONTO", "Bs. 1,00"))).toBe(false);
    expect(mercantilSolicitud.detecta(filas("Nro. de referencia:", "1", "Cuenta destino:", "0102", "Monto (Bs.):", "1,00"))).toBe(false);
  });
});
