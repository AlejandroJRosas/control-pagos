import { claveComparacion, distanciaEdicion } from "@/domain/texto";
import type { CuentasAlias } from "@/domain/cuentasDestino";
import type { CampoPropuesto, CamposDeposito } from "./tipos";

/** Confianza de una cuenta destino leída que no se ha usado nunca: el OCR pudo leer mal el nombre. */
const CONFIANZA_CUENTA_NUEVA = 0.7;

/**
 * Las cuentas destino son pocas y se repiten (las de la empresa). Una variante recordada pasa a su nombre unificado.
 * Si la leída no coincide con ninguna ya usada, se marca como heurística (ámbar) para que se revise; si se parece a una sola
 * conocida (pocas letras de diferencia: el OCR perdió o confundió alguna), se propone esa, también en ámbar.
 * Sin cuentas registradas no se toca nada.
 */
export function ajustarCuentaDestino(
  fields: Partial<Record<CamposDeposito, CampoPropuesto>>,
  conocidas: string[],
  alias: CuentasAlias = new Map(),
): Partial<Record<CamposDeposito, CampoPropuesto>> {
  const c = fields.cuentaDestino;
  if (!c) return fields;
  const unificada = alias.get(claveComparacion(c.value));
  if (unificada) return { ...fields, cuentaDestino: { ...c, value: unificada } };
  if (conocidas.length === 0) return fields;
  const clave = claveComparacion(c.value);
  if (conocidas.some((k) => claveComparacion(k) === clave)) return fields;
  const parecida = cuentaParecida(clave, conocidas);
  return { ...fields, cuentaDestino: { value: parecida ?? c.value, confidence: Math.min(c.confidence, CONFIANZA_CUENTA_NUEVA) } };
}

/**
 * La conocida que se parece a la leída: a lo más 2 letras de diferencia y no más del 20 % del nombre, y que no haya otra
 * igual de cerca (con un empate no se adivina).
 */
function cuentaParecida(clave: string, conocidas: string[]): string | undefined {
  const tope = Math.min(2, Math.floor(clave.length * 0.2));
  if (tope === 0) return undefined;
  let mejor: { cuenta: string; d: number } | undefined;
  let empate = false;
  const vistas = new Set<string>();
  for (const k of conocidas) {
    const ck = claveComparacion(k);
    if (vistas.has(ck)) continue;
    vistas.add(ck);
    const d = distanciaEdicion(clave, ck);
    if (d > tope) continue;
    if (!mejor || d < mejor.d) [mejor, empate] = [{ cuenta: k, d }, false];
    else if (d === mejor.d) empate = true;
  }
  return mejor && !empate ? mejor.cuenta : undefined;
}
