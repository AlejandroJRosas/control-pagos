import { claveComparacion } from "./texto";

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * ¿`texto` aparece en alguno de los `textos` (sin mayúsculas, acentos ni espacios)? Si `texto` es un número
 * ("1.234", "1234,5"), también se busca por sus dígitos dentro de los `montos` ya formateados.
 */
export function coincideBusqueda(textos: string[], montos: string[], texto: string): boolean {
  const k = claveComparacion(texto);
  if (!k) return true;
  if ([...textos, ...montos].some((c) => claveComparacion(c).includes(k))) return true;
  const digitos = soloDigitos(texto);
  return /^[\d.,\s]+$/.test(texto) && digitos !== "" && montos.some((m) => soloDigitos(m).includes(digitos));
}
