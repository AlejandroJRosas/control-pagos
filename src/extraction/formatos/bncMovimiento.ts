import { valorDebajo, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * BNC, "Movimientos en Línea" (App BNC - Datos compartido de movimiento): etiquetas con ":" encima de su valor
 * (Fecha/Hora, Descripción, Referencia, Monto, Detalle de la Operación "TELF.:58412… CED.:… BANCO:0172").
 * El OCR pierde las etiquetas y valores en gris claro (la fecha, "Referencia:"): la referencia se recupera como
 * la fila de solo dígitos justo encima de "Monto:". El destino es el teléfono del pago móvil.
 */

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = /^\d{1,2}\/\d{1,2}\/\d{4}/.exec(valorDebajo(filas, "Fecha/Hora") ?? "")?.[0];
  return v && fechaDesdeDmy(v) ? crudo(v, "etiqueta") : undefined;
}

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const ref = digitos(valorDebajo(filas, "Referencia"));
  if (ref) return crudo(ref, "etiqueta");
  const i = filas.findIndex((f) => /^Monto\s*:?$/i.test(f.texto.trim()));
  const antes = i > 0 ? filas[i - 1].texto.trim() : "";
  return /^\d{6,}$/.test(antes) ? crudo(antes, "heuristica") : undefined;
}

function telefono(filas: Fila[]): CampoCrudo | undefined {
  const tel = /TELF\D*(\d{10,})/i.exec(valorDebajo(filas, "Detalle de la Operación") ?? "")?.[1];
  return tel ? crudo(tel, "etiqueta") : undefined;
}

export const bncMovimiento: Reconocedor<CamposDeposito> = {
  id: "bnc-movimiento",
  detecta(filas) {
    if (!filas.some((f) => /\bApp BNC\b|Banco Nacional de Cr/i.test(f.texto))) return false;
    return ["Detalle de la Operación", "Monto", "Fecha/Hora", "Referencia"].filter((e) => valorDebajo(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("BNC", "constante") };
    const v = valorDebajo(filas, "Monto");
    const campos = {
      montoBs: v ? montoBs(v, "etiqueta") : undefined,
      fecha: fecha(filas),
      referencia: referencia(filas),
      cuentaDestino: telefono(filas),
    };
    for (const [k, c] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (c) r[k] = c;
    return r;
  },
};
