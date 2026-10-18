import type ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export async function saveWorkbook(wb: ExcelJS.Workbook, defaultName: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
  if (!path) return false;
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(path, new Uint8Array(buffer as ArrayBuffer));
  return true;
}
