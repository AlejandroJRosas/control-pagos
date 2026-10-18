import { valorDebajo, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * Banesco, "Resultado de la operación": cada etiqueta en mayúsculas encima de su valor
 * (Número de referencia, Fecha, Desde mi cuenta, Beneficiario, Número de cuenta, Monto "Bs. 431.724,30").
 * El beneficiario puede venir recortado por la app ("INVERSIONES MARI...S"); se toma tal cual.
 */

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Fecha");
  return v && fechaDesdeDmy(v) ? crudo(v, "etiqueta") : undefined;
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Monto");
  return v ? montoBs(v.replace(/^B[s5]\.?\s*/i, "").trim(), "etiqueta") : undefined;
}

export const banescoOperacion: Reconocedor<CamposDeposito> = {
  id: "banesco-operacion",
  detecta(filas) {
    if (valorDebajo(filas, "Desde mi cuenta") === null) return false;
    return ["Número de referencia", "Beneficiario", "Número de cuenta", "Monto"].filter((e) => valorDebajo(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Banesco", "constante") };
    const ref = digitos(valorDebajo(filas, "Número de referencia"));
    const beneficiario = valorDebajo(filas, "Beneficiario");
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
