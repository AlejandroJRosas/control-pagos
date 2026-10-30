import type { SqlDriver } from "../driver";
import { claveComparacion } from "@/domain/texto";
import type { CuentasAlias } from "@/domain/cuentasDestino";

/** Una variante recordada: `alias` = `claveComparacion(variante)`, `variante` = cómo se escribió, `cuenta` = nombre unificado. */
export type AliasCuenta = { alias: string; variante: string; cuenta: string };
/** Cómo estaba cada fila tocada (null = no existía), para deshacer con `restaurarAliasCuentas`. */
export type PrevioAliasCuenta = { alias: string; fila: AliasCuenta | null };

export const listAliasCuentas = (db: SqlDriver): Promise<AliasCuenta[]> =>
  db.select<AliasCuenta>("SELECT alias, variante, cuenta FROM cuentas_alias ORDER BY cuenta COLLATE NOCASE, variante COLLATE NOCASE");

export async function aliasCuentas(db: SqlDriver): Promise<CuentasAlias> {
  return new Map((await listAliasCuentas(db)).map((a) => [a.alias, a.cuenta]));
}

const guardar = (db: SqlDriver, a: AliasCuenta) =>
  db.execute("INSERT INTO cuentas_alias (alias, variante, cuenta) VALUES (?, ?, ?) ON CONFLICT(alias) DO UPDATE SET variante = excluded.variante, cuenta = excluded.cuenta", [
    a.alias,
    a.variante,
    a.cuenta,
  ]);

/**
 * Recuerda que cada una de `variantes` es la cuenta `cuenta`. Las que apuntaban a una de esas variantes pasan a `cuenta` y
 * `cuenta` deja de ser variante de otra (así no hay cadenas ni ciclos). Si falla, deja todo como estaba.
 */
export async function recordarVariantesCuenta(db: SqlDriver, variantes: string[], cuenta: string): Promise<PrevioAliasCuenta[]> {
  const destino = claveComparacion(cuenta);
  const nuevas = new Map<string, string>();
  for (const v of variantes) if (claveComparacion(v) && claveComparacion(v) !== destino) nuevas.set(claveComparacion(v), v.trim());
  const filas = await listAliasCuentas(db);
  const encadenadas = filas.filter((f) => nuevas.has(claveComparacion(f.cuenta)) && !nuevas.has(f.alias) && f.alias !== destino);
  const previos: PrevioAliasCuenta[] = [
    ...filas.filter((f) => f.alias === destino || nuevas.has(f.alias) || encadenadas.includes(f)).map((f) => ({ alias: f.alias, fila: f })),
    ...[...nuevas.keys()].filter((k) => !filas.some((f) => f.alias === k)).map((alias) => ({ alias, fila: null })),
  ];
  try {
    await db.execute("DELETE FROM cuentas_alias WHERE alias = ?", [destino]);
    for (const f of encadenadas) await guardar(db, { ...f, cuenta });
    for (const [alias, variante] of nuevas) await guardar(db, { alias, variante, cuenta });
  } catch (err) {
    await restaurarAliasCuentas(db, previos);
    throw err;
  }
  return previos;
}

export async function restaurarAliasCuentas(db: SqlDriver, previos: PrevioAliasCuenta[]): Promise<void> {
  for (const p of previos) {
    if (p.fila) await guardar(db, p.fila);
    else await db.execute("DELETE FROM cuentas_alias WHERE alias = ?", [p.alias]);
  }
}

/** Olvida una variante (lo ya guardado no cambia). */
export async function eliminarAliasCuenta(db: SqlDriver, alias: string): Promise<PrevioAliasCuenta[]> {
  const [fila] = await db.select<AliasCuenta>("SELECT alias, variante, cuenta FROM cuentas_alias WHERE alias = ?", [alias]);
  await db.execute("DELETE FROM cuentas_alias WHERE alias = ?", [alias]);
  return fila ? [{ alias, fila }] : [];
}
