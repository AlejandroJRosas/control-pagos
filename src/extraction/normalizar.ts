import Decimal from "decimal.js";
import { isValidIsoDate } from "@/domain/dates";
import { parseMonto, parseTasa, toInputVE } from "@/domain/money";
import type { CampoCrudo, CampoPropuesto, CamposDeposito, CamposTasa } from "./tipos";

/** Windows OCR no da confianza: se deduce de cómo halló el reconocedor el valor. */
const CONFIANZA: Record<CampoCrudo["certeza"], number> = { etiqueta: 0.9, heuristica: 0.7, constante: 0.95 };
const CONFIANZA_FECHA_FUTURA = 0.6;

/** Primera fecha d/m/aaaa del texto (tolera espacios junto a las barras) como YYYY-MM-DD. */
export function fechaDesdeDmy(texto: string): string | null {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(texto);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

const positivo = (canonico: string | null) => (canonico && new Decimal(canonico).gt(0) ? toInputVE(canonico) : null);

function fecha(c: CampoCrudo, hoy: string): CampoPropuesto | null {
  const iso = fechaDesdeDmy(c.texto);
  if (!iso) return null;
  const confidence = iso > hoy ? Math.min(CONFIANZA[c.certeza], CONFIANZA_FECHA_FUTURA) : CONFIANZA[c.certeza];
  return { value: iso, confidence };
}

type Normalizador = (c: CampoCrudo, hoy: string) => CampoPropuesto | null;

const conValor =
  (f: (texto: string) => string | null): Normalizador =>
  (c) => {
    const value = f(c.texto);
    return value ? { value, confidence: CONFIANZA[c.certeza] } : null;
  };

const textoLibre = conValor((t) => t.trim() || null);

function normalizar<F extends string>(
  normalizadores: Record<F, Normalizador>,
  crudos: Partial<Record<F, CampoCrudo>>,
  hoy: string,
): Partial<Record<F, CampoPropuesto>> {
  const r: Partial<Record<F, CampoPropuesto>> = {};
  for (const k of Object.keys(crudos) as F[]) {
    const c = crudos[k];
    const p = c ? normalizadores[k](c, hoy) : null;
    if (p) r[k] = p;
  }
  return r;
}

const DEPOSITO: Record<CamposDeposito, Normalizador> = {
  fecha,
  montoBs: conValor((t) => positivo(parseMonto(t))),
  referencia: conValor((t) => (/^\d+$/.test(t.trim()) ? t.trim() : null)),
  banco: textoLibre,
  cuentaDestino: textoLibre,
};

const TASA: Record<CamposTasa, Normalizador> = {
  fecha,
  valor: conValor((t) => positivo(parseTasa(t))),
};

export const normalizarDeposito = (crudos: Partial<Record<CamposDeposito, CampoCrudo>>, hoy: string) => normalizar(DEPOSITO, crudos, hoy);
export const normalizarTasa = (crudos: Partial<Record<CamposTasa, CampoCrudo>>, hoy: string) => normalizar(TASA, crudos, hoy);
