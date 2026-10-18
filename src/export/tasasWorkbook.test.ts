import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildTasasWorkbook } from "./tasasWorkbook";
import { isoToExcelDate } from "./campanaWorkbook";

it("exporta las tasas en orden ascendente", async () => {
  const wb = buildTasasWorkbook([
    { id: 2, fecha: "2026-03-02", valor: "37.1234", imagenPath: null, notas: "BCV" },
    { id: 1, fecha: "2026-03-01", valor: "36.5", imagenPath: null, notas: null },
  ]);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = out.getWorksheet("Tasas")!;
  expect(ws.getRow(1).values).toEqual([, "Fecha", "Bs por USD", "Notas"]);
  expect(ws.getCell("A2").value).toEqual(isoToExcelDate("2026-03-01"));
  expect(ws.getCell("B2").value).toBe(36.5);
  expect(ws.getCell("B3").value).toBe(37.1234);
  expect(ws.getCell("C3").value).toBe("BCV");
});
