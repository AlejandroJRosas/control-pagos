import { parseMonto } from "@/domain/money";
import { contiene, valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";

/**
 * Banco de Venezuela, "Transferencias a terceros": monto en una caja ("13.186,80 Bs") y filas
 * etiqueta/valor (Fecha, Operación, Nombre, Origen, Destino, Concepto).
 * El OCR a veces pierde etiquetas en gris o confunde caracteres: esos casos se recuperan como heurística.
 */

const MONTO_BS = /([\d.,]+)\s*Bs\.?\s*$/i;
/** "17.200.00": el OCR leyó la coma decimal como punto. */
const MONTO_PUNTO_DECIMAL = /^\d{1,3}(\.\d{3})*\.\d{2}$/;
const MONTO_SOLO = /^\d{1,3}(\.\d{3})*,\d{2}$/;
/** "15110/2026": el OCR leyó la primera barra como 1. */
const FECHA_BARRA_COMO_UNO = /(\d{2})[1lI|](\d{2})\s*\/\s*(\d{4})/;
const LARGO_REFERENCIA = 12;

const crudo = (texto: string, certeza: CampoCrudo["certeza"]): CampoCrudo => ({ texto, certeza });

function monto(filas: Fila[]): CampoCrudo | undefined {
  for (const f of filas) {
    const m = MONTO_BS.exec(f.texto);
    if (!m) continue;
    if (parseMonto(m[1])) return crudo(m[1], "etiqueta");
    if (MONTO_PUNTO_DECIMAL.test(m[1])) return crudo(m[1].replace(/\.(\d{2})$/, ",$1"), "heuristica");
  }
  const solo = filas.find((f) => MONTO_SOLO.test(f.texto.trim()));
  return solo ? crudo(solo.texto.trim(), "heuristica") : undefined;
}

function repararFecha(texto: string): string | null {
  const m = FECHA_BARRA_COMO_UNO.exec(texto);
  if (!m) return null;
  const reparada = `${m[1]}/${m[2]}/${m[3]}`;
  return fechaDesdeDmy(reparada) ? reparada : null;
}

function fecha(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Fecha");
  if (v && fechaDesdeDmy(v)) return crudo(v, "etiqueta");
  const candidatos = v ? [v, ...filas.map((f) => f.texto)] : filas.map((f) => f.texto);
  for (const t of candidatos) if (fechaDesdeDmy(t)) return crudo(t, "heuristica");
  for (const t of candidatos) {
    const r = repararFecha(t);
    if (r) return crudo(r, "heuristica");
  }
  return undefined;
}

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Operación");
  const corrida = v ? /\d{6,}/.exec(v)?.[0] : undefined;
  if (corrida) return crudo(corrida, corrida.length === LARGO_REFERENCIA ? "etiqueta" : "heuristica");
  for (const f of filas) {
    const m = new RegExp(`(?<!\\d)\\d{${LARGO_REFERENCIA}}(?!\\d)`).exec(f.texto);
    if (m) return crudo(m[0], "heuristica");
  }
  return undefined;
}

export const bdvTransferenciaTerceros: Reconocedor<CamposDeposito> = {
  id: "bdv-transferencia-terceros",
  detecta(filas) {
    if (!contiene(filas, "Transferencias a terceros")) return false;
    return ["Operación", "Origen", "Destino", "Nombre"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Banco de Venezuela", "constante") };
    const nombre = valorDeEtiqueta(filas, "Nombre");
    const campos = { montoBs: monto(filas), fecha: fecha(filas), referencia: referencia(filas), cuentaDestino: nombre ? crudo(nombre, "etiqueta") : undefined };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
