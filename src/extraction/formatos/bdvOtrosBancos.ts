import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * Banco de Venezuela, "Transferencias a otros bancos": monto en una caja ("62.000,00 Bs") y filas etiqueta/valor
 * (Fecha, Operación de 13 dígitos, Nombre, Identificación, Origen, Destino enmascarado, Banco = el de destino,
 * Concepto, Estatus). El OCR pierde etiquetas en gris (Fecha) y el destino con asteriscos: la fecha sale entonces de
 * la fila que sea solo una fecha (heurística) y como destino va el nombre, como en "Transferencias a terceros".
 */

const MONTO_BS = /([\d.,]+)\s*Bs\.?\s*$/i;
const LARGO_REFERENCIA = 13;

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
  if (v && fechaDesdeDmy(v)) return crudo(v, "etiqueta");
  const sola = filas.map((f) => f.texto.trim()).find((t) => fechaDesdeDmy(t));
  return sola ? crudo(sola, "heuristica") : undefined;
}

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const ref = digitos(valorDeEtiqueta(filas, "Operación"));
  return ref ? crudo(ref, ref.length === LARGO_REFERENCIA ? "etiqueta" : "heuristica") : undefined;
}

export const bdvOtrosBancos: Reconocedor<CamposDeposito> = {
  id: "bdv-otros-bancos",
  detecta(filas) {
    const todo = filas.map((f) => f.texto).join(" ");
    if (!claveComparacion(todo).includes(claveComparacion("Transferencias a otros bancos"))) return false;
    return ["Operación", "Nombre", "Origen", "Destino"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Venezuela", "constante") };
    const nombre = valorDeEtiqueta(filas, "Nombre");
    const campos = { montoBs: monto(filas), fecha: fecha(filas), referencia: referencia(filas), cuentaDestino: nombre ? crudo(nombre, "etiqueta") : undefined };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
