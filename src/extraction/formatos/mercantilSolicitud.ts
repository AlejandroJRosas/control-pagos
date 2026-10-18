import { valorDebajo, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * Mercantil, "Tu solicitud fue enviada": etiquetas con ":" encima de su valor (Monto (Bs.), Nro. de referencia,
 * Fecha y hora de envío, Cuenta origen, Cuenta destino). No trae el nombre del beneficiario: el destino es la cuenta.
 * El logo no sirve para detectarlo (el OCR lo lee como "/l/lercantil").
 */

/** "1 6/10/2026": el OCR metió un espacio entre los dígitos del día o del mes. */
const FECHA_CON_ESPACIOS = /^[\d\s/]+\d{4}/;

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Fecha y hora de envío");
  const m = v ? FECHA_CON_ESPACIOS.exec(v) : null;
  if (!m) return undefined;
  const limpia = m[0].replace(/\s+/g, "");
  if (!fechaDesdeDmy(limpia)) return undefined;
  return crudo(limpia, limpia === m[0] ? "etiqueta" : "heuristica");
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Monto (Bs.)");
  return v ? montoBs(v.trim(), "etiqueta") : undefined;
}

export const mercantilSolicitud: Reconocedor<CamposDeposito> = {
  id: "mercantil-solicitud",
  detecta(filas) {
    if (valorDebajo(filas, "Cuenta origen") === null) return false;
    return ["Nro. de referencia", "Cuenta destino", "Monto (Bs.)", "Fecha y hora de envío"].filter((e) => valorDebajo(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Mercantil", "constante") };
    const ref = digitos(valorDebajo(filas, "Nro. de referencia"));
    const destino = digitos(valorDebajo(filas, "Cuenta destino"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha(filas),
      referencia: ref ? crudo(ref, "etiqueta") : undefined,
      cuentaDestino: destino ? crudo(destino, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
