import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView, DepositoCalculado, GerenteResumen, Resumen } from "@/domain/campanaView";
import { formatPct, formatUsd } from "@/domain/money";
import { formatFecha, formatPeriodo, todayIso } from "@/domain/dates";
import { COLOR, argb, colorTextoRestante, textoRestante } from "./estilo";

const MONEY = "#,##0.00";
const TASA = "#,##0.0000";
const PCT = "0.0%";
const FECHA = "dd/mm/yyyy";
const num = (s: string) => Number(s);

export function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Excel no admite comillas simples al inicio o al final del nombre de una hoja. */
const sinApostrofesNiEspaciosEnBordes = (s: string) => s.replace(/^[\s']+|[\s']+$/g, "");

export function safeSheetName(name: string, used: Set<string>): string {
  const limpio = sinApostrofesNiEspaciosEnBordes(name.replace(/[[\]:*?/\\]/g, " "))
    // ExcelJS no escapa el apóstrofo en las referencias a la hoja (títulos de impresión): se usa el tipográfico.
    .replace(/'/g, "’");
  const base = sinApostrofesNiEspaciosEnBordes(limpio.slice(0, 31)) || "Hoja";
  // "History" es un nombre reservado por Excel.
  if (base.toLowerCase() === "history") used.add("history");
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const MONEY_NEG = "#,##0.00;[Red]-#,##0.00";
const USD_GRANDE = '"$ "#,##0.00;-"$ "#,##0.00';

const solido = (c: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(c) } });
const lineaFina: Partial<ExcelJS.Border> = { style: "thin", color: { argb: argb(COLOR.linea) } };

/** Filas 1-2: franja azul combinada a lo ancho con el título y el subtítulo. */
function franjaTitulo(ws: ExcelJS.Worksheet, columnas: number, titulo: string, subtitulo: string): void {
  ws.mergeCells(1, 1, 1, columnas);
  ws.mergeCells(2, 1, 2, columnas);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 17, color: { argb: argb("ffffff") } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;
  const st = ws.getCell(2, 1);
  st.value = subtitulo;
  st.font = { color: { argb: argb("c9d6e8") } };
  for (const r of [1, 2]) for (let c = 1; c <= columnas; c++) ws.getCell(r, c).fill = solido(COLOR.azul);
  // Las columnas de fecha tienen numFmt propio: los títulos son texto.
  for (const r of [1, 2, 3]) ws.getCell(r, 1).numFmt = "General";
}

/** Encabezado azul, filas alternadas, bordes finos, autofiltro y panel inmovilizado bajo el encabezado. */
function estilarTabla(ws: ExcelJS.Worksheet, filaEncabezado: number, ultimaFila: number, columnas: number): void {
  const enc = ws.getRow(filaEncabezado);
  for (let c = 1; c <= columnas; c++) {
    const cell = enc.getCell(c);
    cell.font = { bold: true, color: { argb: argb("ffffff") } };
    cell.fill = solido(COLOR.azul);
    cell.alignment = { vertical: "middle" };
  }
  enc.height = 20;
  for (let r = filaEncabezado + 1; r <= ultimaFila; r++) {
    const banda = (r - filaEncabezado) % 2 === 0;
    for (let c = 1; c <= columnas; c++) {
      const cell = ws.getCell(r, c);
      cell.border = { top: lineaFina, bottom: lineaFina, left: lineaFina, right: lineaFina };
      if (banda) cell.fill = solido(COLOR.banda);
    }
  }
  ws.views = [{ state: "frozen", ySplit: filaEncabezado }];
  ws.autoFilter = { from: { row: filaEncabezado, column: 1 }, to: { row: filaEncabezado, column: columnas } };
}

function estilarTotal(row: ExcelJS.Row, columnas: number): void {
  for (let c = 1; c <= columnas; c++) {
    const cell = row.getCell(c);
    cell.font = { ...cell.font, bold: true };
    cell.fill = solido(COLOR.total);
    cell.border = { top: { style: "medium", color: { argb: argb(COLOR.azul) } }, bottom: lineaFina };
  }
}

const corte = (generadoEn: Date) => `Corte ${formatFecha(todayIso(generadoEn))}`;

function addResumen(ws: ExcelJS.Worksheet, campana: Campana, view: CampanaView, generadoEn: Date): void {
  const columnas = 7;
  const estado = campana.estado === "activa" ? "Activa" : "Cerrada";
  franjaTitulo(ws, columnas, campana.nombre, `${formatPeriodo(campana.fechaInicio, campana.fechaFin)} · ${estado} · ${corte(generadoEn)}`);

  const { total } = view;
  ["Asignado", "Pagado", "Restante", "Avance"].forEach((etiqueta, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = etiqueta;
    cell.font = { size: 10, color: { argb: argb(COLOR.gris) } };
  });
  const cifras: [ExcelJS.CellValue, string, string | null][] = [
    [num(total.asignado), USD_GRANDE, null],
    [num(total.pagado), USD_GRANDE, COLOR.textoVerde],
    [num(total.restante), USD_GRANDE, colorTextoRestante(total)],
    [total.pct / 100, PCT, null],
  ];
  cifras.forEach(([valor, fmt, color], i) => {
    const cell = ws.getCell(5, i + 1);
    cell.value = valor;
    cell.numFmt = fmt;
    cell.font = { bold: true, size: 14, ...(color ? { color: { argb: argb(color) } } : {}) };
    cell.alignment = { horizontal: "left" };
  });
  ws.getRow(5).height = 22;

  const filaEncabezado = 7;
  ws.getRow(filaEncabezado).values = ["Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"];
  const formatos = [null, MONEY, MONEY, MONEY_NEG, PCT, null, FECHA];
  const fila = (nombre: string, r: CampanaView["total"]) => [
    nombre,
    num(r.asignado),
    num(r.pagado),
    num(r.restante),
    r.pct / 100,
    r.cantidad,
    r.ultimaFecha ? isoToExcelDate(r.ultimaFecha) : null,
  ];
  const escribir = (n: number, valores: ExcelJS.CellValue[]) => {
    const row = ws.getRow(n);
    row.values = valores;
    formatos.forEach((f, i) => f && (row.getCell(i + 1).numFmt = f));
    return row;
  };
  view.gerentes.forEach((g, i) => escribir(filaEncabezado + 1 + i, fila(g.gerenteNombre, g)));
  const ultimaFila = filaEncabezado + view.gerentes.length;
  estilarTabla(ws, filaEncabezado, ultimaFila, columnas);
  estilarTotal(escribir(ultimaFila + 1, fila("TOTAL", total)), columnas);
  if (view.gerentes.length > 0) {
    ws.addConditionalFormatting({
      ref: `E${filaEncabezado + 1}:E${ultimaFila}`,
      rules: [
        {
          type: "dataBar",
          priority: 1,
          // Sin degradado, ExcelJS escribe la barra x14 completa (con su id) y Excel la abre sin reparar.
          gradient: false,
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 1 },
          ],
          color: { argb: argb(COLOR.barraAzul) },
        } as ExcelJS.DataBarRuleType,
      ],
    });
  }

  ws.getColumn(1).width = 28;
  for (const c of [2, 3, 4]) ws.getColumn(c).width = 16;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 16;
  imprimir(ws, filaEncabezado);
}

function imprimir(ws: ExcelJS.Worksheet, filaEncabezado: number): void {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
  };
}

type HojaDepositos = { titulo: string; resumen?: GerenteResumen };

function addDepositos(ws: ExcelJS.Worksheet, campana: Campana, totalCampana: Resumen, deps: DepositoCalculado[], hoja: HojaDepositos, generadoEn: Date): void {
  const general = !hoja.resumen;
  ws.columns = [
    { key: "fecha", width: 12, style: { numFmt: FECHA } },
    ...(general ? [{ key: "gerente", width: 24 }] : []),
    { key: "banco", width: 18 },
    { key: "referencia", width: 18 },
    { key: "cuenta", width: 26 },
    { key: "montoBs", width: 16, style: { numFmt: MONEY } },
    { key: "tasa", width: 12, style: { numFmt: TASA } },
    { key: "usd", width: 14, style: { numFmt: MONEY } },
    { key: "saldo", width: 20, style: { numFmt: MONEY_NEG } },
    { key: "obs", width: 30 },
    { key: "img", width: 40 },
  ];
  const columnas = ws.columns.length;
  franjaTitulo(ws, columnas, hoja.titulo, `Campaña ${campana.nombre} · ${corte(generadoEn)}`);
  if (hoja.resumen) {
    const r = hoja.resumen;
    const restante = textoRestante(r);
    const cell = ws.getCell(3, 1);
    cell.value = `Asignado ${formatUsd(r.asignado)} · Pagado ${formatUsd(r.pagado)} · ${restante.etiqueta} ${restante.monto} · Avance ${formatPct(r.pct)}`;
    cell.font = { bold: true, color: { argb: argb(restante.excedido ? COLOR.textoRojo : COLOR.azul) } };
    cell.numFmt = "General";
  }

  const filaEncabezado = 5;
  ws.getRow(filaEncabezado).values = [
    "Fecha",
    ...(general ? ["Gerente"] : []),
    "Banco",
    "Referencia",
    "Cuenta destino",
    "Monto Bs",
    "Tasa",
    "USD",
    general ? "Saldo general restante" : "Saldo restante",
    "Observaciones",
    "Comprobante",
  ];
  deps.forEach((d, i) => {
    ws.getRow(filaEncabezado + 1 + i).values = {
      fecha: isoToExcelDate(d.fecha),
      gerente: d.gerenteNombre,
      banco: d.banco,
      referencia: d.referencia,
      cuenta: d.cuentaDestino,
      montoBs: num(d.montoBs),
      tasa: num(d.tasaValor),
      usd: num(d.usd),
      saldo: num(general ? d.saldoGeneralRestante : d.saldoGerenteRestante),
      obs: d.observaciones ?? "",
      img: d.imagenPath ? (d.imagenPath.split("/").pop() ?? "") : "",
    };
  });
  const ultimaFila = filaEncabezado + deps.length;
  estilarTabla(ws, filaEncabezado, ultimaFila, columnas);
  const sum = (k: "montoBs" | "usd") => deps.reduce((acc, d) => acc.plus(d[k]), new Decimal(0)).toNumber();
  const total = ws.getRow(ultimaFila + 1);
  const saldoFinal = hoja.resumen?.restante ?? totalCampana.restante;
  total.values = { banco: "TOTAL", montoBs: sum("montoBs"), usd: sum("usd"), saldo: num(saldoFinal) };
  estilarTotal(total, columnas);
  imprimir(ws, filaEncabezado);
}

function nuevoLibro(generadoEn: Date): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Pagos";
  wb.created = generadoEn;
  return wb;
}

/** Excel de un solo gerente en la campaña: su hoja de depósitos con su resumen. */
export function buildGerenteWorkbook(campana: Campana, view: CampanaView, asignacionId: number, generadoEn: Date = new Date()): ExcelJS.Workbook {
  const g = view.gerentes.find((x) => x.asignacionId === asignacionId);
  if (!g) throw new Error(`Asignación ${asignacionId} fuera de la campaña ${campana.id}`);
  const wb = nuevoLibro(generadoEn);
  addDepositos(
    wb.addWorksheet(safeSheetName(g.gerenteNombre, new Set())),
    campana,
    view.total,
    view.depositos.filter((d) => d.asignacionId === asignacionId),
    { titulo: g.gerenteNombre, resumen: g },
    generadoEn,
  );
  return wb;
}

export function buildCampanaWorkbook(campana: Campana, view: CampanaView, generadoEn: Date = new Date()): ExcelJS.Workbook {
  const wb = nuevoLibro(generadoEn);
  const used = new Set<string>();
  addResumen(wb.addWorksheet(safeSheetName("Resumen", used)), campana, view, generadoEn);
  addDepositos(wb.addWorksheet(safeSheetName("Todos los depósitos", used)), campana, view.total, view.depositos, { titulo: "Todos los depósitos" }, generadoEn);
  for (const g of view.gerentes) {
    addDepositos(
      wb.addWorksheet(safeSheetName(g.gerenteNombre, used)),
      campana,
      view.total,
      view.depositos.filter((d) => d.asignacionId === g.asignacionId),
      { titulo: g.gerenteNombre, resumen: g },
      generadoEn,
    );
  }
  return wb;
}
