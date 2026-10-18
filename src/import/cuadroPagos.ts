import type ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { parseMonto, parseTasa } from "@/domain/money";
import { isValidIsoDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";

/** Un depósito leído del cuadro de pagos. Montos en decimal canónico; `problemas` vacío = importable. */
export type FilaCuadro = {
  fila: number;
  fecha: string | null;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string | null;
  tasa: string | null;
  observaciones: string | null;
  problemas: string[];
};

export type CuadroPagos = { hoja: string; gerenteNombre: string | null; saldoInicial: string | null; filas: FilaCuadro[] };

type Columna = "fecha" | "banco" | "referencia" | "cuenta" | "bs" | "tasa" | "obs";

/** Sin acentos, mayúsculas, espacios ni signos: "Bs." → "bs", "TASA DEL DIA   VIGENTE" → "tasadeldiavigente". */
const clave = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const COLUMNAS: [Columna, (k: string) => boolean][] = [
  ["fecha", (k) => k.includes("fecha")],
  ["banco", (k) => k.includes("banco")],
  ["referencia", (k) => k.includes("referencia")],
  ["cuenta", (k) => k.includes("cuenta")],
  ["bs", (k) => k === "bs" || k.startsWith("montobs") || k.includes("bolivares")],
  ["tasa", (k) => k.includes("tasa")],
  ["obs", (k) => k.includes("observ")],
];
const OBLIGATORIAS: Columna[] = ["fecha", "referencia", "bs", "tasa"];

/** Valor "visible" de una celda: resultado de fórmulas, texto de texto enriquecido e hipervínculos. */
function valor(c: ExcelJS.Cell): unknown {
  const v = c.value;
  if (v === null || v === undefined || v instanceof Date || typeof v !== "object") return v;
  if ("formula" in v || "sharedFormula" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  return null; // errores (#N/A, #DIV/0!…)
}

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

const isoUtc = (d: Date): string => d.toISOString().slice(0, 10);
const EPOCH_EXCEL = Date.UTC(1899, 11, 30);

function fecha(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : isoUtc(v);
  if (typeof v === "number" && v > 0) return isoUtc(new Date(EPOCH_EXCEL + Math.round(v) * 86_400_000));
  const s = texto(v);
  let iso: string | null = null;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    iso = `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  }
  return iso && isValidIsoDate(iso) ? iso : null;
}

/** Números de Excel con 2 decimales (Bs) o hasta 8 (tasas); el texto se lee en formato venezolano. */
function numero(v: unknown, decimales: number, parse: (s: string) => string | null): string | null {
  if (typeof v === "number") return v > 0 && Number.isFinite(v) ? new Decimal(v).toDecimalPlaces(decimales).toFixed() : null;
  const s = texto(v);
  if (!s) return null;
  const p = parse(s);
  return p !== null && new Decimal(p).gt(0) ? p : null;
}

function buscarEncabezado(ws: ExcelJS.Worksheet): { fila: number; cols: Partial<Record<Columna, number>> } | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 200); r++) {
    const cols: Partial<Record<Columna, number>> = {};
    ws.getRow(r).eachCell((c, col) => {
      const k = clave(texto(valor(c)));
      if (!k) return;
      const hit = COLUMNAS.find(([name, test]) => cols[name] === undefined && test(k));
      if (hit) cols[hit[0]] = col;
    });
    if (OBLIGATORIAS.every((c) => cols[c] !== undefined)) return { fila: r, cols };
  }
  return null;
}

/** Busca una etiqueta ("NOMBRE Y APELLIDO:") en las filas de arriba y devuelve su fila y columna. */
function buscarEtiqueta(ws: ExcelJS.Worksheet, hasta: number, test: (k: string) => boolean): { row: ExcelJS.Row; col: number } | null {
  for (let r = 1; r < hasta; r++) {
    const row = ws.getRow(r);
    let col = 0;
    row.eachCell((c, n) => {
      if (!col && test(clave(texto(valor(c))))) col = n;
    });
    if (col) return { row, col };
  }
  return null;
}

function leerGerente(ws: ExcelJS.Worksheet, hasta: number): string | null {
  const e = buscarEtiqueta(ws, hasta, (k) => k.startsWith("nombreyapellido") || k === "nombre" || k === "gerente");
  if (!e) return null;
  const etiqueta = texto(valor(e.row.getCell(e.col)));
  for (let c = e.col + 1; c <= e.col + 12; c++) {
    const t = texto(valor(e.row.getCell(c)));
    if (t && t !== etiqueta) return t.replace(/\s+/g, " ");
  }
  return null;
}

function leerSaldoInicial(ws: ExcelJS.Worksheet, hasta: number): string | null {
  const e = buscarEtiqueta(ws, hasta, (k) => k.startsWith("saldoinicial"));
  if (!e) return null;
  let ultimo: string | null = null;
  e.row.eachCell((c) => {
    const v = valor(c);
    if (typeof v === "number" && v > 0) ultimo = new Decimal(v).toDecimalPlaces(2).toFixed();
  });
  return ultimo;
}

/** "FACTURA C3 - 2026 - ROSMARY MADERO.xlsx" → "ROSMARY MADERO". */
export function nombreDesdeArchivo(archivo: string): string | null {
  const partes = archivo.replace(/\.[^.]+$/, "").split(/\s+-\s+/);
  return partes.length > 1 ? partes[partes.length - 1].trim() || null : null;
}

function elegirHoja(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; enc: NonNullable<ReturnType<typeof buscarEncabezado>> } | null {
  const hojas = [...wb.worksheets].sort((a, b) => Number(clave(b.name).includes("pagos")) - Number(clave(a.name).includes("pagos")));
  for (const ws of hojas) {
    const enc = buscarEncabezado(ws);
    if (enc) return { ws, enc };
  }
  return null;
}

/** `tasaEscrita`: la celda (o el campo) de la tasa tiene algo, aunque no se pueda leer. */
function problemas(f: FilaCuadro, tasaEscrita: boolean): string[] {
  const p: string[] = [];
  if (!f.fecha) p.push("Fecha inválida");
  if (!f.banco) p.push("Falta el banco");
  if (!f.referencia) p.push("Falta la referencia");
  if (!f.cuentaDestino) p.push("Falta la cuenta destino");
  if (!f.montoBs) p.push("Monto en Bs inválido");
  if (!f.tasa) p.push(tasaEscrita ? "Tasa inválida" : "Falta la tasa");
  return p;
}

export type CampoEditable = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs" | "tasa";
/** Lo que el usuario escribió para completar una fila: fecha en ISO, montos y tasa en formato venezolano. */
export type EdicionFila = Partial<Record<CampoEditable, string>>;

/** Campos que el Excel no trae o no se pudieron leer. */
export function camposFaltantes(f: FilaCuadro): CampoEditable[] {
  const faltan: [CampoEditable, boolean][] = [
    ["fecha", !f.fecha],
    ["banco", !f.banco],
    ["referencia", !f.referencia],
    ["cuentaDestino", !f.cuentaDestino],
    ["montoBs", !f.montoBs],
    ["tasa", !f.tasa],
  ];
  return faltan.filter(([, falta]) => falta).map(([c]) => c);
}

const positivo = (p: string | null): string | null => (p !== null && new Decimal(p).gt(0) ? p : null);

/** La fila con lo que el usuario completó encima de lo leído del Excel, y sus problemas recalculados. */
export function aplicarEdicion(f: FilaCuadro, ed: EdicionFila | undefined): FilaCuadro {
  if (!ed) return f;
  const r: FilaCuadro = { ...f };
  if (ed.fecha !== undefined) r.fecha = isValidIsoDate(ed.fecha) ? ed.fecha : null;
  if (ed.banco !== undefined) r.banco = ed.banco.trim();
  if (ed.referencia !== undefined) r.referencia = ed.referencia.trim();
  if (ed.cuentaDestino !== undefined) r.cuentaDestino = ed.cuentaDestino.trim();
  if (ed.montoBs !== undefined) r.montoBs = positivo(parseMonto(ed.montoBs));
  if (ed.tasa !== undefined) r.tasa = positivo(parseTasa(ed.tasa));
  const tasaEscrita = ed.tasa !== undefined ? ed.tasa.trim() !== "" : f.problemas.includes("Tasa inválida");
  r.problemas = problemas(r, tasaEscrita);
  return r;
}

export function parseCuadroPagos(wb: ExcelJS.Workbook, archivo?: string): CuadroPagos {
  const hallado = elegirHoja(wb);
  if (!hallado) {
    throw new DomainError(
      "VALIDACION",
      "No se encontró el CUADRO DE PAGOS: se busca una fila con las columnas Fecha, Referencia, Bs. y Tasa",
    );
  }
  const { ws, enc } = hallado;
  const celda = (row: ExcelJS.Row, col: Columna): unknown => (enc.cols[col] ? valor(row.getCell(enc.cols[col])) : null);

  const filas: FilaCuadro[] = [];
  for (let r = enc.fila + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const crudo = { fecha: celda(row, "fecha"), referencia: texto(celda(row, "referencia")), bs: celda(row, "bs") };
    const vacia = !texto(crudo.fecha) && !crudo.referencia && !texto(crudo.bs);
    if (vacia) continue;
    let esTotal = false;
    row.eachCell((c) => {
      if (clave(texto(valor(c))).startsWith("total")) esTotal = true;
    });
    if (esTotal) continue;

    const f: FilaCuadro = {
      fila: r,
      fecha: fecha(crudo.fecha),
      banco: texto(celda(row, "banco")),
      referencia: crudo.referencia,
      cuentaDestino: texto(celda(row, "cuenta")),
      montoBs: numero(crudo.bs, 2, parseMonto),
      tasa: numero(celda(row, "tasa"), 8, parseTasa),
      observaciones: texto(celda(row, "obs")) || null,
      problemas: [],
    };
    f.problemas = problemas(f, texto(celda(row, "tasa")) !== "");
    filas.push(f);
  }

  return {
    hoja: ws.name,
    gerenteNombre: leerGerente(ws, enc.fila) ?? (archivo ? nombreDesdeArchivo(archivo) : null),
    saldoInicial: leerSaldoInicial(ws, enc.fila),
    filas,
  };
}
