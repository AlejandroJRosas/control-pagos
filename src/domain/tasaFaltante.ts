import { fechaDeTasa, isValidIsoDate } from "./dates";

/** `hoy`: fecha de la tasa que rige hoy (en fin de semana o feriado, la del siguiente día hábil) si falta. */
export type TasasFaltantes = { hoy: string | null; anteriores: string[] };

/**
 * Qué tasas faltan y alguien necesita: la que rige hoy y las de días anteriores que usan los depósitos en
 * revisión (`fechasCola`). Los días sin tasa que nadie usa no se avisan.
 */
export function tasasFaltantes(hoy: string, conTasa: ReadonlySet<string>, feriados: ReadonlySet<string>, fechasCola: string[]): TasasFaltantes {
  const rigeHoy = fechaDeTasa(hoy, feriados);
  const anteriores = new Set<string>();
  for (const f of fechasCola) {
    if (!isValidIsoDate(f)) continue;
    const rige = fechaDeTasa(f, feriados);
    if (rige < rigeHoy && !conTasa.has(rige)) anteriores.add(rige);
  }
  return { hoy: conTasa.has(rigeHoy) ? null : rigeHoy, anteriores: [...anteriores].sort() };
}
