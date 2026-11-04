import type { Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, montoBs } from "./comun";

/**
 * Banesco, línea de la lista de movimientos (sin etiquetas): "TRFMB 0134 / J123456789 / INVERSIONES MARIA / 0390"
 * (transferencia, banco, RIF del beneficiario, su nombre y los últimos dígitos de la cuenta), el monto "BS 2.418,00"
 * a la derecha y abajo "17/08/2026 -" con la referencia (en la misma fila o en la siguiente). El nombre puede venir en
 * varias filas y junto al monto; el destino es el nombre, sin los dígitos de la cuenta.
 */

const RE_MONTO = /\bB[sS5]\.?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/;
const RE_FECHA = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{6,})?\s*$/;

const indiceFecha = (filas: Fila[]) => filas.findIndex((f) => RE_FECHA.test(f.texto.trim()));

function referencia(filas: Fila[], i: number): CampoCrudo | undefined {
  const misma = RE_FECHA.exec(filas[i].texto.trim())?.[2];
  if (misma) return crudo(misma, "etiqueta");
  const siguiente = filas[i + 1]?.texto.trim() ?? "";
  return /^\d{6,}$/.test(siguiente) ? crudo(siguiente, "etiqueta") : undefined;
}

/** El nombre del beneficiario: lo que sigue al RIF en las filas entre "TRFMB" y la fecha, sin el monto ni los dígitos de la cuenta. */
function beneficiario(filas: Fila[], hasta: number): CampoCrudo | undefined {
  const desde = filas.findIndex((f) => /\bTRFMB\b/i.test(f.texto));
  if (desde < 0) return undefined;
  const texto = filas
    .slice(desde, hasta < 0 ? undefined : hasta)
    .map((f) => f.texto.replace(RE_MONTO, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const nombre = /\bTRFMB\s+\d{4}\s+[VJEGP]-?\d{6,10}\s+(.+?)(?:\s+\d{3,4})?$/i.exec(texto)?.[1]?.trim();
  return nombre ? crudo(nombre, "heuristica") : undefined;
}

export const banescoMovimiento: Reconocedor<CamposDeposito> = {
  id: "banesco-movimiento",
  detecta(filas) {
    if (!filas.some((f) => /^TRFMB\s+\d{4}\b/i.test(f.texto.trim()))) return false;
    return indiceFecha(filas) >= 0 && filas.some((f) => RE_MONTO.test(f.texto));
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Banesco", "constante") };
    const i = indiceFecha(filas);
    const fecha = i >= 0 ? RE_FECHA.exec(filas[i].texto.trim())?.[1] : undefined;
    const monto = filas.map((f) => RE_MONTO.exec(f.texto)?.[1]).find(Boolean);
    const campos = {
      montoBs: monto ? montoBs(monto, "etiqueta") : undefined,
      fecha: fecha && fechaDesdeDmy(fecha) ? crudo(fecha, "etiqueta") : undefined,
      referencia: i >= 0 ? referencia(filas, i) : undefined,
      cuentaDestino: beneficiario(filas, i),
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
