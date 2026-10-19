import type { SqlDriver } from "./driver";

export type Integridad = { ok: true } | { ok: false; detalle: string[] };

/** Revisión rápida al abrir: estructura de SQLite y referencias entre tablas. */
export async function verificarIntegridad(db: SqlDriver): Promise<Integridad> {
  const quick = await db.select<{ quick_check: string }>("PRAGMA quick_check");
  const detalle = quick.map((r) => r.quick_check).filter((m) => m !== "ok");
  const fk = await db.select<{ table: string; rowid: number; parent: string }>("PRAGMA foreign_key_check");
  for (const r of fk) detalle.push(`${r.table} fila ${r.rowid} → ${r.parent}`);
  return detalle.length === 0 ? { ok: true } : { ok: false, detalle };
}
