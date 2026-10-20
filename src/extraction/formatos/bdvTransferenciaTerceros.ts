import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, montoBs } from "./comun";

/**
 * Banco de Venezuela, "Transferencias a terceros": monto en una caja ("13.186,80 Bs") y filas
 * etiqueta/valor (Fecha, Operación, Nombre, Origen, Destino, Concepto).
 * El OCR a veces pierde etiquetas en gris o confunde caracteres: esos casos se recuperan como heurística.
 * En pantallas angostas la app parte los valores: la operación sigue en la fila de abajo ("059130685" / "662")
 * y el nombre va debajo de "Nombre:" en varias filas.
 */

const MONTO_BS = /([\d.,]+)\s*Bs\.?\s*$/i;
const MONTO_SOLO = /^\d{1,3}(\.\d{3})*,\d{2}$/;
/** "15110/2026": el OCR leyó la primera barra como 1. */
const FECHA_BARRA_COMO_UNO = /(\d{2})[1lI|](\d{2})\s*\/\s*(\d{4})/;
const LARGO_REFERENCIA = 12;
const ETIQUETAS = ["Fecha", "Operación", "Nombre", "Origen", "Destino", "Concepto"];

const indiceDeEtiqueta = (filas: Fila[], etiqueta: string) =>
  filas.findIndex((f) => claveComparacion(f.texto).startsWith(claveComparacion(etiqueta)));
const esEtiqueta = (f: Fila) => ETIQUETAS.some((e) => claveComparacion(f.texto).startsWith(claveComparacion(e)));

function monto(filas: Fila[]): CampoCrudo | undefined {
  for (const f of filas) {
    const m = MONTO_BS.exec(f.texto);
    if (!m) continue;
    const v = montoBs(m[1], "etiqueta");
    if (v) return v;
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
  if (corrida && corrida.length < LARGO_REFERENCIA) {
    const resto = filas[indiceDeEtiqueta(filas, "Operación") + 1]?.texto.trim();
    if (resto && /^\d+$/.test(resto) && corrida.length + resto.length === LARGO_REFERENCIA) return crudo(corrida + resto, "etiqueta");
  }
  if (corrida) return crudo(corrida, corrida.length === LARGO_REFERENCIA ? "etiqueta" : "heuristica");
  for (const f of filas) {
    const m = new RegExp(`(?<!\\d)\\d{${LARGO_REFERENCIA}}(?!\\d)`).exec(f.texto);
    if (m) return crudo(m[0], "heuristica");
  }
  return undefined;
}

/** Nombre en la fila de la etiqueta o, si la etiqueta va sola, en las filas de abajo hasta la siguiente etiqueta (para revisar: puede faltar un pedazo). */
function nombre(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Nombre");
  if (v) return crudo(v, "etiqueta");
  const i = indiceDeEtiqueta(filas, "Nombre");
  if (i < 0) return undefined;
  const partes: string[] = [];
  for (const f of filas.slice(i + 1)) {
    if (esEtiqueta(f)) break;
    partes.push(f.texto.trim());
  }
  return partes.length ? crudo(partes.join(" "), "heuristica") : undefined;
}

export const bdvTransferenciaTerceros: Reconocedor<CamposDeposito> = {
  id: "bdv-transferencia-terceros",
  detecta(filas) {
    // El título también puede venir partido en dos filas.
    const todo = filas.map((f) => f.texto).join(" ");
    if (!claveComparacion(todo).includes(claveComparacion("Transferencias a terceros"))) return false;
    return ["Operación", "Origen", "Destino", "Nombre"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Venezuela", "constante") };
    const campos = { montoBs: monto(filas), fecha: fecha(filas), referencia: referencia(filas), cuentaDestino: nombre(filas) };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
