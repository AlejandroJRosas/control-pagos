import { nombreLegible } from "@/domain/texto";

/** "Mary Cordero - MARIANDRES C3 2026 - 03-11-2026.xlsx" */
export function archivoExcel(partes: string[], fecha: string): string {
  return `${nombreLegible(partes, fecha)}.xlsx`;
}

export function archivoPdf(partes: string[], fecha: string): string {
  return `${nombreLegible(partes, fecha)}.pdf`;
}
