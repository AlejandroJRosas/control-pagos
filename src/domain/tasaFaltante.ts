import { esDiaHabil, fechaDeTasa, isValidIsoDate } from "./dates";

export type TasasFaltantes = { hoy: boolean; anteriores: string[] };

/**
 * Qué tasas faltan y alguien necesita: la de hoy (si es día hábil) y las de días anteriores que usan los
 * depósitos en revisión (`fechasCola`). Los días sin tasa que nadie usa no se avisan.
 */
export function tasasFaltantes(hoy: string, conTasa: ReadonlySet<string>, feriados: ReadonlySet<string>, fechasCola: string[]): TasasFaltantes {
  const anteriores = new Set<string>();
  for (const f of fechasCola) {
    if (!isValidIsoDate(f)) continue;
    const rige = fechaDeTasa(f, feriados);
    if (rige < hoy && !conTasa.has(rige)) anteriores.add(rige);
  }
  return { hoy: esDiaHabil(hoy, feriados) && !conTasa.has(hoy), anteriores: [...anteriores].sort() };
}
