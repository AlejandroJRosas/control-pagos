import { claveComparacion } from "@/domain/texto";
import { valorDebajo, valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { celular, crudo, digitos, montoBs } from "./comun";

/**
 * BBVA Provincial, "Pagar a Otros Bancos" (Dinero Rápido): el monto va debajo de "Monto a enviar" ("Bs 12.348,00")
 * y abajo filas etiqueta/valor (Banco = el de destino, Número celular, Identificación, Concepto, Fecha, Referencia).
 * En el Provincial la referencia que se registra es la cédula de quien paga, que el comprobante no trae:
 * se propone la "Referencia" de la pantalla, para revisar.
 */

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDebajo(filas, "Monto a enviar");
  return v ? montoBs(v.replace(/^B[s5]\.?\s*/i, "").trim(), "etiqueta") : undefined;
}

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Fecha");
  return v && fechaDesdeDmy(v) ? crudo(v, "etiqueta") : undefined;
}

export const provincialDineroRapido: Reconocedor<CamposDeposito> = {
  id: "provincial-dinero-rapido",
  detecta(filas) {
    const todo = claveComparacion(filas.map((f) => f.texto).join(" "));
    if (!todo.includes(claveComparacion("Dinero Rápido")) && !todo.includes(claveComparacion("Pagar a Otros Bancos"))) return false;
    return ["Número celular", "Referencia", "Identificación"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Provincial", "constante") };
    const ref = digitos(valorDeEtiqueta(filas, "Referencia"));
    const tel = celular(valorDeEtiqueta(filas, "Número celular"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha(filas),
      referencia: ref ? crudo(ref, "heuristica") : undefined,
      cuentaDestino: tel ? crudo(tel, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
