import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCampanaWorkbook, isoToExcelDate, safeSheetName } from "./campanaWorkbook";
import { archivoExcel, archivoPdf } from "./fileName";
import { COLOR, argb } from "./estilo";
import { buildCampanaView, type DepositoData } from "@/domain/campanaView";
import type { Campana } from "@/db/repos/campanas";

const campana: Campana = { id: 1, nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, estado: "activa", notas: null, creadoEn: "x" };
const dep = (id: number, asignacionId: number, fecha: string, montoBs: string): DepositoData => ({
  id,
  asignacionId,
  fecha,
  creadoEn: `2026-01-01T00:00:0${id}.000Z`,
  banco: "Banesco",
  referencia: `00${id}`,
  cuentaDestino: "0102",
  montoBs,
  tasaId: 1,
  tasaValor: "36.5",
  observaciones: id === 1 ? "obs" : null,
  imagenPath: id === 1 ? "imagenes/abc.png" : null,
});

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buf = await wb.xlsx.writeBuffer();
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buf);
  return out;
}

describe("safeSheetName", () => {
  it("limpia caracteres inválidos, recorta a 31 y evita repetidos", () => {
    const used = new Set<string>(["resumen"]);
    expect(safeSheetName("Ana/Pérez: [norte]", used)).toBe("Ana Pérez   norte");
    expect(safeSheetName("Resumen", used)).toBe("Resumen (2)");
    expect(safeSheetName("ana/pérez: [norte]", used)).toBe("ana pérez   norte (2)");
    const largo = safeSheetName("x".repeat(40), used);
    expect(largo).toHaveLength(31);
    expect(safeSheetName("x".repeat(40), used)).toBe(`${"x".repeat(27)} (2)`);
    expect(safeSheetName("''", used)).toBe("Hoja");
  });
});

it("nombres que Excel/ExcelJS rechazan no rompen la exportación", async () => {
  const nombres = ["History", "Ana ' ", `${"y".repeat(30)}'z`, "'Luis'"];
  const view = buildCampanaView(
    nombres.map((n, i) => ({ id: i + 1, gerenteId: i + 1, gerenteNombre: n, saldoUsd: "10" })),
    [],
  );
  const wb = await roundTrip(buildCampanaWorkbook(campana, view));
  const hojas = wb.worksheets.map((w) => w.name).slice(2);
  expect(hojas).toHaveLength(4);
  for (const h of hojas) {
    expect(h.toLowerCase()).not.toBe("history");
    expect(h.endsWith("'")).toBe(false);
    expect(h.startsWith("'")).toBe(false);
    expect(h.length).toBeLessThanOrEqual(31);
  }
});

it("archivoExcel genera un nombre seguro", () => {
  expect(archivoExcel("Campaña Marzo/2026", "2026-10-18")).toBe("campana-marzo-2026-2026-10-18.xlsx");
  expect(archivoExcel("***", "2026-10-18")).toBe("reporte-2026-10-18.xlsx");
});

it("archivoPdf genera un nombre seguro", () => {
  expect(archivoPdf("Campaña Marzo/2026", "2026-10-18")).toBe("campana-marzo-2026-2026-10-18.pdf");
  expect(archivoPdf("***", "2026-10-18")).toBe("reporte-2026-10-18.pdf");
});

it("genera resumen, todos los depósitos y una hoja por gerente", async () => {
  const view = buildCampanaView(
    [
      { id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" },
      { id: 2, gerenteId: 20, gerenteNombre: "Ana", saldoUsd: "50" },
    ],
    [dep(1, 1, "2026-03-02", "3650"), dep(2, 2, "2026-03-01", "730")],
  );
  const wb = await roundTrip(buildCampanaWorkbook(campana, view, new Date("2026-10-18T12:00:00Z")));
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Todos los depósitos", "Ana", "Ana (2)"]);

  const resumen = wb.getWorksheet("Resumen")!;
  expect(resumen.getCell("A1").value).toBe("Marzo");
  expect(String(resumen.getCell("A2").value)).toContain("01/03/2026 – en curso · Activa · Corte 18/10/2026");
  expect([resumen.getCell("A5").value, resumen.getCell("B5").value, resumen.getCell("C5").value, resumen.getCell("D5").value]).toEqual([150, 120, 30, 0.8]);
  expect(resumen.getRow(7).values).toEqual([, "Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"]);
  expect(resumen.getCell("A8").value).toBe("Ana");
  expect(resumen.getCell("C8").value).toBe(100);
  const total = resumen.getRow(10);
  expect(total.getCell(1).value).toBe("TOTAL");
  expect(total.getCell(2).value).toBe(150);
  expect(total.getCell(3).value).toBe(120);
  expect(total.getCell(4).value).toBe(30);
  expect(total.getCell(5).value).toBe(0.8);

  const todos = wb.getWorksheet("Todos los depósitos")!;
  expect(todos.getCell("A1").value).toBe("Todos los depósitos");
  expect(todos.getCell("A6").value).toEqual(isoToExcelDate("2026-03-01"));
  expect(todos.getCell("B6").value).toBe("Ana");
  expect(todos.getCell("D6").value).toBe("002");
  expect(todos.getCell("I6").value).toBe(130);
  expect(todos.getCell("I7").value).toBe(30);
  expect(todos.getCell("K7").value).toBe("abc.png");
  expect(todos.getCell("C8").value).toBe("TOTAL");
  expect(todos.getCell("H8").value).toBe(120);

  const ana = wb.getWorksheet("Ana")!;
  expect(ana.getCell("A1").value).toBe("Ana");
  expect(String(ana.getCell("A3").value)).toContain("Asignado $ 100,00 · Pagado $ 100,00 · Faltan $ 0,00 · Avance 100,0 %");
  expect(ana.getCell("H6").value).toBe(0);
  expect(ana.getCell("I6").value).toBe("obs");
  expect(ana.getCell("H7").value).toBe(0);
  expect(todos.getCell("I8").value).toBe(30);
});

const formatosCondicionales = (ws: ExcelJS.Worksheet) =>
  (ws as unknown as { conditionalFormattings: ExcelJS.ConditionalFormattingOptions[] }).conditionalFormattings;
const fondo = (c: ExcelJS.Cell) => (c.fill?.type === "pattern" ? c.fill.fgColor?.argb : undefined);

it("resumen con formato: franja, filas alternadas, barra de datos y total", () => {
  const view = buildCampanaView(
    [
      { id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" },
      { id: 2, gerenteId: 20, gerenteNombre: "Luis", saldoUsd: "50" },
    ],
    [dep(1, 1, "2026-03-02", "3650")],
  );
  const ws = buildCampanaWorkbook(campana, view, new Date("2026-10-18T12:00:00Z")).getWorksheet("Resumen")!;
  expect(ws.getCell("A1").isMerged).toBe(true);
  expect(fondo(ws.getCell("A1"))).toBe(argb(COLOR.azul));
  expect(fondo(ws.getCell("A8"))).toBeUndefined();
  expect(fondo(ws.getCell("A9"))).toBe(argb(COLOR.banda));
  const reglas = formatosCondicionales(ws).flatMap((cf) => cf.rules.map((r) => ({ ref: cf.ref, type: r.type })));
  expect(reglas).toContainEqual({ ref: "E8:E9", type: "dataBar" });
  expect(ws.getCell("A10").value).toBe("TOTAL");
  expect(ws.getCell("A10").font.bold).toBe(true);
});

it("campaña sin gerentes: el total queda en la primera fila de la tabla", () => {
  const ws = buildCampanaWorkbook(campana, buildCampanaView([], [])).getWorksheet("Resumen")!;
  expect(ws.getCell("A8").value).toBe("TOTAL");
  expect(formatosCondicionales(ws)).toHaveLength(0);
});

it("todas las hojas quedan listas para imprimir", async () => {
  const view = buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" }], [dep(1, 1, "2026-03-02", "3650")]);
  const wb = await roundTrip(buildCampanaWorkbook(campana, view));
  for (const ws of wb.worksheets) {
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.fitToPage).toBe(true);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
  }
  expect(wb.getWorksheet("Resumen")!.pageSetup.printTitlesRow).toBe("7:7");
  expect(wb.getWorksheet("Ana")!.pageSetup.printTitlesRow).toBe("5:5");
});

it("gerente sin depósitos: su hoja solo tiene el total en cero", async () => {
  const view = buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Luis", saldoUsd: "50" }], []);
  const ws = (await roundTrip(buildCampanaWorkbook(campana, view))).getWorksheet("Luis")!;
  expect(ws.getCell("B6").value).toBe("TOTAL");
  expect(ws.getCell("E6").value).toBe(0);
  expect(ws.getCell("G6").value).toBe(0);
});

it("un apóstrofo dentro del nombre no rompe los títulos de impresión", async () => {
  const used = new Set<string>();
  expect(safeSheetName("Ana D'Ambrosio", used)).toBe("Ana D’Ambrosio");
  const view = buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Ana D'Ambrosio", saldoUsd: "10" }], []);
  const wb = await roundTrip(buildCampanaWorkbook(campana, view));
  expect(wb.worksheets.map((w) => w.name)).toContain("Ana D’Ambrosio");
});

it("la barra de datos usa el formato moderno de Excel (x14, sin degradado)", () => {
  const view = buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" }], []);
  const ws = buildCampanaWorkbook(campana, view).getWorksheet("Resumen")!;
  const regla = formatosCondicionales(ws)[0].rules[0] as ExcelJS.DataBarRuleType;
  expect(regla.type).toBe("dataBar");
  expect(regla.gradient).toBe(false);
});

it("las celdas de título no heredan el formato de fecha de la columna", () => {
  const view = buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" }], []);
  const ws = buildCampanaWorkbook(campana, view).getWorksheet("Ana")!;
  for (const ref of ["A1", "A2", "A3"]) expect(ws.getCell(ref).numFmt ?? "General").toBe("General");
});
