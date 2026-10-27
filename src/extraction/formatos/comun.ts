import { parseMonto } from "@/domain/money";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo } from "../tipos";

export const crudo = (texto: string, certeza: CampoCrudo["certeza"]): CampoCrudo => ({ texto, certeza });

/** "17.200.00": el OCR leyó la coma decimal como punto. */
const MONTO_PUNTO_DECIMAL = /^\d{1,3}(\.\d{3})*\.\d{2}$/;

/** Monto en Bs: tal cual si se lee, o reparado como heurística si el OCR cambió la coma decimal por punto. */
export function montoBs(texto: string, certeza: CampoCrudo["certeza"]): CampoCrudo | undefined {
  if (parseMonto(texto)) return crudo(texto, certeza);
  if (MONTO_PUNTO_DECIMAL.test(texto)) return crudo(texto.replace(/\.(\d{2})$/, ",$1"), "heuristica");
  return undefined;
}

/** Primera corrida de 6 o más dígitos (ignora el ícono de copiar leído como carácter suelto). */
export const digitos = (texto: string | null): string | undefined => (texto ? /\d{6,}/.exec(texto)?.[0] : undefined);

/** Celular venezolano del pago móvil como "04141234567", aunque venga sin el 0 o tras el código del banco ("0172. 4141234567"). */
export function celular(texto: string | null): string | undefined {
  const m = texto ? /(?<!\d)0?(4\d{9})(?!\d)/.exec(texto) : null;
  return m ? `0${m[1]}` : undefined;
}

/** "16-10-2026" o "19/10/26": fecha d/m/a con guiones o barras y año de 2 o 4 cifras, como "16/10/2026". */
export function fechaDma(texto: string | null): string | undefined {
  const m = texto ? /(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4}|\d{2})(?!\d)/.exec(texto) : null;
  if (!m) return undefined;
  const v = `${m[1]}/${m[2]}/${m[3].length === 2 ? `20${m[3]}` : m[3]}`;
  return fechaDesdeDmy(v) ? v : undefined;
}
