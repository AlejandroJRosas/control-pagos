import { valorDebajo, contiene, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, fechaDma, montoBs } from "./comun";

/**
 * Bancamiga Suite, "Transacción Procesada": cada etiqueta en mayúsculas encima de su valor (Numero de referencia,
 * Monto de la operación "Bs. 215.862,15", Nombre del beneficiario, Cuenta a acreditar enmascarada, Fecha "19/10/26 07:39 pm").
 * La referencia mide 10 dígitos y lleva pegado el ícono de copiar, que el OCR puede leer como un 0 de más:
 * con 11 dígitos terminados en 0 se quita y queda para revisar. El destino es el beneficiario.
 */

const LARGO_REFERENCIA = 10;

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const ref = /\d{6,}/.exec(valorDebajo(filas, "Numero de referencia") ?? "")?.[0];
  if (!ref) return undefined;
  if (ref.length === LARGO_REFERENCIA) return crudo(ref, "etiqueta");
  if (ref.length === LARGO_REFERENCIA + 1 && ref.endsWith("0")) return crudo(ref.slice(0, -1), "heuristica");
  return crudo(ref, "heuristica");
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Monto de la operación");
  return v ? montoBs(v.replace(/^B[s5]\.?\s*/i, "").trim(), "etiqueta") : undefined;
}

/** "MYA COLECCIONES 2006„ C.A": el OCR lee la coma doble como comillas bajas. */
function beneficiario(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Nombre del beneficiario");
  return v ? crudo(v.replace(/[„,]+/g, ","), "etiqueta") : undefined;
}

export const bancamigaTransaccion: Reconocedor<CamposDeposito> = {
  id: "bancamiga-transaccion",
  detecta(filas) {
    if (!contiene(filas, "Bancamiga")) return false;
    return ["Numero de referencia", "Monto de la operación", "Nombre del beneficiario", "Cuenta a acreditar"].filter((e) => valorDebajo(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Bancamiga", "constante") };
    const fecha = fechaDma(valorDebajo(filas, "Fecha"));
    const campos = { montoBs: monto(filas), fecha: fecha ? crudo(fecha, "etiqueta") : undefined, referencia: referencia(filas), cuentaDestino: beneficiario(filas) };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
