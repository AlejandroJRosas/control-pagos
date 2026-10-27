import { claveComparacion } from "@/domain/texto";
import { contiene, valorDebajo, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { celular, crudo, digitos, fechaDma, montoBs } from "./comun";

/**
 * Banco Digital de los Trabajadores, app móvil: "Detalle de Operación" (P2P: Fecha operación, Referencia, Monto, Descripción)
 * y "Operación exitosa" del pago móvil (Referencia, Teléfono, Número de Identificación, Banco destino, Concepto, Monto,
 * Fecha "23/10/2026, 09:43 PM"). Cada etiqueta va encima de su valor y el monto lleva "Bs" detrás.
 * El destino es el celular; el detalle no lo trae. El OCR puede leer el logo "BDT" como "BOT": se detecta por el nombre del banco.
 */

const ETIQUETAS = ["Referencia", "Monto", "Fecha operación", "Fecha", "Descripción", "Teléfono", "Banco destino", "Número de Identificación"];

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Monto");
  return v ? montoBs(v.replace(/\s*B[s5]\.?$/i, "").trim(), "etiqueta") : undefined;
}

/** "TeléfonO�.": la etiqueta suele salir mal leída, así que basta que la fila empiece por "telefon". */
function telefono(filas: Fila[]): CampoCrudo | undefined {
  const i = filas.findIndex((f) => claveComparacion(f.texto).startsWith("telefon"));
  const tel = i >= 0 ? celular(filas[i + 1]?.texto ?? null) : undefined;
  return tel ? crudo(tel, "etiqueta") : undefined;
}

export const bdtOperacion: Reconocedor<CamposDeposito> = {
  id: "bdt-operacion",
  detecta(filas) {
    if (!contiene(filas, "de los Trabajadores")) return false;
    return valorDebajo(filas, "Referencia") !== null && ETIQUETAS.filter((e) => valorDebajo(filas, e) !== null).length >= 3;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Banco Digital de los Trabajadores", "constante") };
    const ref = digitos(valorDebajo(filas, "Referencia"));
    const fecha = fechaDma(valorDebajo(filas, "Fecha operación") ?? valorDebajo(filas, "Fecha"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha ? crudo(fecha, "etiqueta") : undefined,
      referencia: ref ? crudo(ref, "etiqueta") : undefined,
      cuentaDestino: telefono(filas),
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
