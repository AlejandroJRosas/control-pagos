import ExcelJS from "exceljs";
import type { Tasa } from "@/db/repos/tasas";
import { isoToExcelDate } from "./campanaWorkbook";

export function buildTasasWorkbook(tasas: Tasa[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Pagos";
  const ws = wb.addWorksheet("Tasas");
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Bs por USD", key: "valor", width: 14, style: { numFmt: "#,##0.0000" } },
    { header: "Notas", key: "notas", width: 40 },
  ];
  for (const t of [...tasas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    ws.addRow({ fecha: isoToExcelDate(t.fecha), valor: Number(t.valor), notas: t.notas ?? "" });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return wb;
}
