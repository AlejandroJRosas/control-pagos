import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * Banco Digital de los Trabajadores, "Resumen de transferencia" (bdtenlinea): filas etiqueta/valor
 * (Fecha "15-10-2026 01:12 pm", Número de referencia, Nombre del Beneficiario, Cuenta a Acreditar enmascarada, Monto Bs.).
 * La fecha va con guiones; el destino es el beneficiario, porque la cuenta viene enmascarada.
 */

const FECHA_GUIONES = /(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4})/;
const MONTO = /^Monto\s*B[s5]\.?\s*:?\s*(\S+)/i;

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const m = FECHA_GUIONES.exec(valorDeEtiqueta(filas, "Fecha") ?? "");
  const v = m ? `${m[1]}/${m[2]}/${m[3]}` : null;
  return v && fechaDesdeDmy(v) ? crudo(v, "etiqueta") : undefined;
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  for (const f of filas) {
    const m = MONTO.exec(f.texto.trim());
    if (m) return montoBs(m[1], "etiqueta");
  }
  return undefined;
}

export const bdtTransferencia: Reconocedor<CamposDeposito> = {
  id: "bdt-transferencia",
  detecta(filas) {
    const todo = claveComparacion(filas.map((f) => f.texto).join(" "));
    if (!todo.includes(claveComparacion("Digital de los Trabajadores")) && !todo.includes("bdt.com.ve")) return false;
    return ["Número de referencia", "Nombre del Beneficiario", "Cuenta a Acreditar", "Cuenta a Debitar"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Banco Digital de los Trabajadores", "constante") };
    const ref = digitos(valorDeEtiqueta(filas, "Número de referencia"));
    const beneficiario = valorDeEtiqueta(filas, "Nombre del Beneficiario");
    const campos = {
      montoBs: monto(filas),
      fecha: fecha(filas),
      referencia: ref ? crudo(ref, "etiqueta") : undefined,
      cuentaDestino: beneficiario ? crudo(beneficiario, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
