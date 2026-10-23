import { archivoBase } from "@/domain/texto";

export { archivoBase };

export function archivoExcel(nombre: string, fecha: string): string {
  return `${archivoBase(nombre) || "reporte"}-${fecha}.xlsx`;
}

export function archivoPdf(nombre: string, fecha: string): string {
  return `${archivoBase(nombre) || "reporte"}-${fecha}.pdf`;
}
