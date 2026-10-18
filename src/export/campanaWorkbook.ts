import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView, DepositoCalculado } from "@/domain/campanaView";
import { formatPeriodo } from "@/domain/dates";

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
  const base = sinApostrofesNiEspaciosEnBordes(sinApostrofesNiEspaciosEnBordes(name.replace(/[[\]:*?/\\]/g, " ")).slice(0, 31)) || "Hoja";
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

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number, columns: number): void {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  }
  ws.views = [{ state: "frozen", ySplit: rowNumber }];
  ws.autoFilter = { from: { row: rowNumber, column: 1 }, to: { row: rowNumber, column: columns } };
}

function addResumen(ws: ExcelJS.Worksheet, campana: Campana, view: CampanaView, generadoEn: Date): void {
  ws.addRow(["Campaña", campana.nombre]);
  ws.addRow(["Período", formatPeriodo(campana.fechaInicio, campana.fechaFin)]);
  ws.addRow(["Estado", campana.estado === "activa" ? "Activa" : "Cerrada"]);
  ws.addRow(["Generado", generadoEn.toLocaleString("es-VE")]);
  ws.addRow([]);
  ws.addRow(["Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"]);
  const fila = (nombre: string, r: CampanaView["total"]) => [
    nombre,
    num(r.asignado),
    num(r.pagado),
    num(r.restante),
    r.pct / 100,
    r.cantidad,
    r.ultimaFecha ? isoToExcelDate(r.ultimaFecha) : null,
  ];
  for (const g of view.gerentes) ws.addRow(fila(g.gerenteNombre, g));
  ws.addRow(fila("TOTAL", view.total)).font = { bold: true };

  ws.getColumn(1).width = 28;
  for (const c of [2, 3, 4]) Object.assign(ws.getColumn(c), { width: 16, numFmt: MONEY });
  Object.assign(ws.getColumn(5), { width: 12, numFmt: PCT });
  ws.getColumn(6).width = 12;
  Object.assign(ws.getColumn(7), { width: 16, numFmt: FECHA });
  styleHeader(ws, 6, 7);
}

function addDepositos(ws: ExcelJS.Worksheet, deps: DepositoCalculado[], general: boolean): void {
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: FECHA } },
    ...(general ? [{ header: "Gerente", key: "gerente", width: 24 }] : []),
    { header: "Banco", key: "banco", width: 18 },
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "Cuenta destino", key: "cuenta", width: 26 },
    { header: "Monto Bs", key: "montoBs", width: 16, style: { numFmt: MONEY } },
    { header: "Tasa", key: "tasa", width: 12, style: { numFmt: TASA } },
    { header: "USD", key: "usd", width: 14, style: { numFmt: MONEY } },
    { header: general ? "Saldo general restante" : "Saldo restante", key: "saldo", width: 20, style: { numFmt: MONEY } },
    { header: "Observaciones", key: "obs", width: 30 },
    { header: "Comprobante", key: "img", width: 40 },
  ];
  for (const d of deps) {
    ws.addRow({
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
    });
  }
  const sum = (k: "montoBs" | "usd") => deps.reduce((acc, d) => acc.plus(d[k]), new Decimal(0)).toNumber();
  ws.addRow({ banco: "TOTAL", montoBs: sum("montoBs"), usd: sum("usd") }).font = { bold: true };
  styleHeader(ws, 1, ws.columns.length);
}

export function buildCampanaWorkbook(campana: Campana, view: CampanaView, generadoEn: Date = new Date()): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Pagos";
  wb.created = generadoEn;
  const used = new Set<string>();
  addResumen(wb.addWorksheet(safeSheetName("Resumen", used)), campana, view, generadoEn);
  addDepositos(wb.addWorksheet(safeSheetName("Todos los depósitos", used)), view.depositos, true);
  for (const g of view.gerentes) {
    addDepositos(
      wb.addWorksheet(safeSheetName(g.gerenteNombre, used)),
      view.depositos.filter((d) => d.asignacionId === g.asignacionId),
      false,
    );
  }
  return wb;
}
