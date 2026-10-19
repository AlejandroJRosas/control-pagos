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
