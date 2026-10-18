import { parseMonto } from "@/domain/money";
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
