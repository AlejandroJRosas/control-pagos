/** Clave para comparar textos sin distinguir mayúsculas, acentos ni espacios. */
export const claveComparacion = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "")
    .toLowerCase();

/** Clave de una referencia bancaria: como `claveComparacion` y sin ceros a la izquierda ("000123" = "123"). */
export function claveReferencia(ref: string): string {
  const k = claveComparacion(ref);
  const sinCeros = k.replace(/^0+/, "");
  return sinCeros === "" && k !== "" ? "0" : sinCeros;
}

/** Una parte de un nombre de archivo tal como se escribió (mayúsculas y acentos), sin lo que Windows no acepta. */
const parteLegible = (s: string): string =>
  s
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.]+$/g, "");

/** "Mary Cordero - MARIANDRES C3 2026 - 03-11-2026": las partes como se ven en la app y la fecha dd-mm-aaaa. */
export function nombreLegible(partes: string[], fechaIso: string): string {
  const [a, m, d] = fechaIso.split("-");
  const limpias = partes.map(parteLegible).filter((p) => /[\p{L}\p{N}]/u.test(p));
  return [...(limpias.length ? limpias : ["Reporte"]), `${d}-${m}-${a}`].join(" - ");
}

/** Nombre apto para archivo: sin acentos, minúsculas y guiones. */
export function archivoBase(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
