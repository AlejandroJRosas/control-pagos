import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { claveComparacion } from "@/domain/texto";
import { aliasCuentas } from "../repos/cuentasAlias";

/**
 * Deja cada cuenta destino guardada (depósitos y borradores de la cola) con su nombre unificado. Solo toca las variantes
 * recordadas, así que se puede repetir. Devuelve cuántos depósitos cambió.
 */
export async function unificarCuentas(db: SqlDriver): Promise<number> {
  const alias = await aliasCuentas(db);
  if (alias.size === 0) return 0;
  const unificada = (cuenta: string) => {
    const c = alias.get(claveComparacion(cuenta));
    return c && c !== cuenta ? c : null;
  };
  let cambiados = 0;
  const cuentas = await db.select<{ cuenta: string }>("SELECT DISTINCT cuenta_destino AS cuenta FROM depositos");
  for (const { cuenta } of cuentas) {
    const c = unificada(cuenta);
    if (!c) continue;
    const r = await db.execute("UPDATE depositos SET cuenta_destino = ?, actualizado_en = ? WHERE cuenta_destino = ?", [c, nowIso(), cuenta]);
    cambiados += r.rowsAffected;
  }
  const borradores = await db.select<{ cuenta: string | null }>("SELECT DISTINCT json_extract(borrador, '$.draft.cuentaDestino') AS cuenta FROM cola_depositos");
  for (const { cuenta } of borradores) {
    const c = cuenta ? unificada(cuenta) : null;
    if (!c) continue;
    await db.execute("UPDATE cola_depositos SET borrador = json_set(borrador, '$.draft.cuentaDestino', ?) WHERE json_extract(borrador, '$.draft.cuentaDestino') = ?", [
      c,
      cuenta,
    ]);
  }
  return cambiados;
}
