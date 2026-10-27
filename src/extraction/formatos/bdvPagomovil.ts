import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { celular, crudo, montoBs } from "./comun";

/**
 * Banco de Venezuela, PagomóvilBDV ("Comprobante de operación" de PagomóvilBDV Personas, o el movimiento
 * "Operacion pagomovilbdv otros banco"): monto en una caja ("22.002,75 Bs", en el movimiento con signo menos)
 * y filas etiqueta/valor (Fecha, Operación, Identificación, Origen, Destino = celular, Banco = el de destino).
 * El movimiento no trae destino.
 */

const MONTO_BS = /([\d.,]+)\s*Bs\.?\s*$/i;
/** "Operación: 007687628929": con los dígitos, porque el título del movimiento también empieza por "Operacion". */
const OPERACION = /^Operaci[oó]n\s*:?\s*(\d{6,})/i;

const operacion = (filas: Fila[]) => filas.map((f) => OPERACION.exec(f.texto.trim())?.[1]).find(Boolean);

function monto(filas: Fila[]): CampoCrudo | undefined {
  for (const f of filas) {
    const m = MONTO_BS.exec(f.texto);
    const v = m ? montoBs(m[1], "etiqueta") : undefined;
    if (v) return v;
  }
  return undefined;
}

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Fecha");
  return v && fechaDesdeDmy(v) ? crudo(v, "etiqueta") : undefined;
}

export const bdvPagomovil: Reconocedor<CamposDeposito> = {
  id: "bdv-pagomovil",
  detecta(filas) {
    if (!claveComparacion(filas.map((f) => f.texto).join(" ")).includes("pagomovilbdv")) return false;
    return operacion(filas) !== undefined;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Venezuela", "constante") };
    const ref = operacion(filas);
    const tel = celular(valorDeEtiqueta(filas, "Destino"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha(filas),
      referencia: ref ? crudo(ref, "etiqueta") : undefined,
      cuentaDestino: tel ? crudo(tel, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
