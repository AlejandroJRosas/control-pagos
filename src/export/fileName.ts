export function archivoExcel(nombre: string, fecha: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "reporte"}-${fecha}.xlsx`;
}
