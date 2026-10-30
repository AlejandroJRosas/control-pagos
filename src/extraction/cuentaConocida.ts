import { claveComparacion } from "@/domain/texto";
import type { CuentasAlias } from "@/domain/cuentasDestino";
import type { CampoPropuesto, CamposDeposito } from "./tipos";

/** Confianza de una cuenta destino leída que no se ha usado nunca: el OCR pudo leer mal el nombre. */
const CONFIANZA_CUENTA_NUEVA = 0.7;

/**
 * Las cuentas destino son pocas y se repiten (las de la empresa). Una variante recordada pasa a su nombre unificado.
 * Si la leída no coincide con ninguna ya usada, se marca como heurística (ámbar) para que se revise. Sin cuentas registradas no se toca nada.
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
  return { ...fields, cuentaDestino: { ...c, confidence: Math.min(c.confidence, CONFIANZA_CUENTA_NUEVA) } };
}
