import { claveComparacion } from "@/domain/texto";
import type { CampoPropuesto, CamposDeposito } from "./tipos";

/** Confianza de una cuenta destino leída que no se ha usado nunca: el OCR pudo leer mal el nombre. */
const CONFIANZA_CUENTA_NUEVA = 0.7;

/**
 * Las cuentas destino son pocas y se repiten (las de la empresa). Si la leída no coincide con ninguna ya usada,
 * se marca como heurística (ámbar) para que se revise. Sin cuentas registradas no se toca nada.
 */
export function ajustarCuentaDestino(
  fields: Partial<Record<CamposDeposito, CampoPropuesto>>,
  conocidas: string[],
): Partial<Record<CamposDeposito, CampoPropuesto>> {
  const c = fields.cuentaDestino;
  if (!c || conocidas.length === 0) return fields;
  const clave = claveComparacion(c.value);
  if (conocidas.some((k) => claveComparacion(k) === clave)) return fields;
  return { ...fields, cuentaDestino: { ...c, confidence: Math.min(c.confidence, CONFIANZA_CUENTA_NUEVA) } };
}
