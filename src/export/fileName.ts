/** Nombre apto para archivo: sin acentos, minúsculas y guiones. */
export function archivoBase(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function archivoExcel(nombre: string, fecha: string): string {
  return `${archivoBase(nombre) || "reporte"}-${fecha}.xlsx`;
}

export function archivoPdf(nombre: string, fecha: string): string {
  return `${archivoBase(nombre) || "reporte"}-${fecha}.pdf`;
}
