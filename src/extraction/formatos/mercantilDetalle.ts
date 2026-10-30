import { claveComparacion } from "@/domain/texto";
import { contiene, valorDebajo, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, fechaDma, montoBs } from "./comun";

/**
 * Mercantil, detalle de la transferencia (con "Compartir"): etiquetas con ":" encima de su valor (Nro. de Referencia,
 * Fecha y hora, Descripción) y el monto "Bs. 89.869,14" solo, debajo de la descripción. La descripción dice
 * "Transferencia desde la cuenta ***3718 a la cuenta de <beneficiario> ***5875 por bs. … realizada en mercantil personas
 * el 17/10/2026 …": de ahí salen el destino (el beneficiario) y la fecha en que se hizo. "Fecha y hora" puede ser otra
 * (el día en que se acreditó, p. ej. el lunes tras un sábado): si no coinciden, gana la de la descripción, para revisar.
 */

const MONTO = /^B[s5]\.?\s*\d[\d.,]*$/i;

/** Filas de la descripción, unidas: desde la etiqueta hasta el monto. */
function descripcion(filas: Fila[]): string {
  const i = filas.findIndex((f) => claveComparacion(f.texto.replace(/\s*:\s*$/, "")) === claveComparacion("Descripción"));
  if (i < 0) return "";
  const partes: string[] = [];
  for (const f of filas.slice(i + 1)) {
    if (MONTO.test(f.texto.trim())) break;
    partes.push(f.texto.trim());
  }
  return partes.join(" ");
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = filas.map((f) => f.texto.trim()).find((t) => MONTO.test(t));
  return v ? montoBs(v.replace(/^B[s5]\.?\s*/i, ""), "etiqueta") : undefined;
}

function fecha(filas: Fila[], desc: string): CampoCrudo | undefined {
  const realizada = /realizada\b.*?\bel\s+(\S+)/i.exec(desc);
  const hecha = fechaDma(realizada?.[1] ?? null);
  const hora = fechaDma(valorDebajo(filas, "Fecha y hora"));
  if (hecha) return crudo(hecha, !hora || hora === hecha ? "etiqueta" : "heuristica");
  return hora ? crudo(hora, "etiqueta") : undefined;
}

/** "a la cuenta de inversiones mariandres c.a. ***5875 por bs.": el beneficiario, sin la cuenta enmascarada. */
function beneficiario(desc: string): CampoCrudo | undefined {
  const m = /a la cuenta\s+de\s+(.+?)\s*(?:\*+\s*\d*\s*)?por\s+bs/i.exec(desc);
  return m?.[1] ? crudo(m[1].trim(), "etiqueta") : undefined;
}

export const mercantilDetalle: Reconocedor<CamposDeposito> = {
  id: "mercantil-detalle",
  detecta(filas) {
    if (!contiene(filas, "mercantil")) return false;
    return valorDebajo(filas, "Nro. de Referencia") !== null && valorDebajo(filas, "Descripción") !== null;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Mercantil", "constante") };
    const desc = descripcion(filas);
    const ref = digitos(valorDebajo(filas, "Nro. de Referencia"));
    const campos = { montoBs: monto(filas), fecha: fecha(filas, desc), referencia: ref ? crudo(ref, "etiqueta") : undefined, cuentaDestino: beneficiario(desc) };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
