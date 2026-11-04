import Decimal from "decimal.js";
import { esDiaHabil, esFinDeSemana, fechaDeTasa, formatFecha, isValidIsoDate, nombreDia, sumarDias } from "./dates";
import { parseTasa } from "./money";

/** Cuántos días hacia atrás, como mucho, propone la carga en lote (aunque la última tasa sea más vieja). */
const MAX_DIAS_ATRAS = 31;

/**
 * Días hábiles sin tasa desde el siguiente a `ultima` (la tasa más reciente) hasta el que rige `hoy` (en fin de semana o
 * feriado, el siguiente hábil). Sin tasas, solo el que rige hoy. No retrocede más de un mes.
 */
export function diasSinTasa(hoy: string, ultima: string | null, conTasa: ReadonlySet<string>, feriados: ReadonlySet<string>): string[] {
  const rige = fechaDeTasa(hoy, feriados);
  const tope = sumarDias(rige, -MAX_DIAS_ATRAS);
  let f = ultima ? sumarDias(ultima, 1) : rige;
  if (f < tope) f = tope;
  const dias: string[] = [];
  for (; f <= rige; f = sumarDias(f, 1)) if (esDiaHabil(f, feriados) && !conTasa.has(f)) dias.push(f);
  return dias;
}

export type FilaTasaLote = { fecha: string; valor: string };
export type TasaExistente = { id: number; valor: string; usos: number };
export type CambioTasa = { fecha: string; valor: string } & ({ tipo: "nueva" } | { tipo: "corregir"; id: number; antes: string; usos: number });
/** `errores` va por fila (null = bien); `afectados` = depósitos cuyo USD cambia por las correcciones. */
export type PlanTasasLote = { cambios: CambioTasa[]; errores: (string | null)[]; afectados: number };

/**
 * Qué guarda la carga en lote: las filas con valor crean la tasa o, si la fecha ya tiene, la corrigen (si cambia).
 * Una fila vacía o igual a la guardada no hace nada; las que tienen error no se incluyen.
 */
export function planTasasLote(filas: FilaTasaLote[], existentes: ReadonlyMap<string, TasaExistente>, feriados: ReadonlySet<string>): PlanTasasLote {
  const cuantas = new Map<string, number>();
  for (const f of filas) if (f.valor.trim()) cuantas.set(f.fecha, (cuantas.get(f.fecha) ?? 0) + 1);
  const vistas = new Set<string>();
  const cambios: CambioTasa[] = [];
  let afectados = 0;
  const errores = filas.map((f): string | null => {
    if (!f.valor.trim()) return null;
    if (!isValidIsoDate(f.fecha)) return "Fecha inválida";
    if (!esDiaHabil(f.fecha, feriados)) {
      const rige = fechaDeTasa(f.fecha, feriados);
      const dia = esFinDeSemana(f.fecha) ? nombreDia(f.fecha).replace(/^./, (c) => c.toUpperCase()) : "Feriado";
      return `${dia}: usa la tasa del ${nombreDia(rige)} ${formatFecha(rige)}`;
    }
    if (vistas.has(f.fecha) && (cuantas.get(f.fecha) ?? 0) > 1) return "Fecha repetida";
    vistas.add(f.fecha);
    const parsed = parseTasa(f.valor);
    if (parsed === null || !new Decimal(parsed).gt(0)) return "Tasa inválida (ej. 36,50)";
    const valor = new Decimal(parsed).toFixed();
    const actual = existentes.get(f.fecha);
    if (!actual) cambios.push({ tipo: "nueva", fecha: f.fecha, valor });
    else if (!new Decimal(actual.valor).eq(valor)) {
      cambios.push({ tipo: "corregir", fecha: f.fecha, valor, id: actual.id, antes: actual.valor, usos: actual.usos });
      afectados += actual.usos;
    }
    return null;
  });
  return { cambios, errores, afectados };
}
