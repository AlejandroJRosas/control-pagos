import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCampanaWorkbook, isoToExcelDate, safeSheetName } from "./campanaWorkbook";
import { archivoExcel } from "./fileName";
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
  expect(resumen.getCell("B1").value).toBe("Marzo");
  expect(resumen.getRow(6).values).toEqual([, "Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"]);
  expect(resumen.getCell("A7").value).toBe("Ana");
  expect(resumen.getCell("C7").value).toBe(100);
  const total = resumen.getRow(9);
  expect(total.getCell(1).value).toBe("TOTAL");
  expect(total.getCell(2).value).toBe(150);
  expect(total.getCell(3).value).toBe(120);
  expect(total.getCell(4).value).toBe(30);
  expect(total.getCell(5).value).toBe(0.8);

  const todos = wb.getWorksheet("Todos los depósitos")!;
  expect(todos.getCell("A2").value).toEqual(isoToExcelDate("2026-03-01"));
  expect(todos.getCell("B2").value).toBe("Ana");
  expect(todos.getCell("D2").value).toBe("002");
  expect(todos.getCell("I2").value).toBe(130);
  expect(todos.getCell("I3").value).toBe(30);
  expect(todos.getCell("K3").value).toBe("abc.png");
  expect(todos.getCell("C4").value).toBe("TOTAL");
  expect(todos.getCell("H4").value).toBe(120);

  const ana = wb.getWorksheet("Ana")!;
  expect(ana.getCell("H2").value).toBe(0);
  expect(ana.getCell("I2").value).toBe("obs");
});
