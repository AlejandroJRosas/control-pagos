import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { bancoCanonico } from "@/domain/bancos";
import { bancosConocidos } from "../repos/bancosAlias";

/**
 * Deja cada banco guardado (depósitos y borradores de la cola) con su nombre canónico. Solo toca lo que cambia,
 * así que se puede repetir. Devuelve cuántos depósitos cambió.
 */
export async function unificarBancos(db: SqlDriver): Promise<number> {
  const conocidos = await bancosConocidos(db);
  let cambiados = 0;
  const bancos = await db.select<{ banco: string }>("SELECT DISTINCT banco FROM depositos");
  for (const { banco } of bancos) {
    const canonico = bancoCanonico(banco, conocidos);
    if (!canonico || canonico === banco) continue;
    const r = await db.execute("UPDATE depositos SET banco = ?, actualizado_en = ? WHERE banco = ?", [canonico, nowIso(), banco]);
    cambiados += r.rowsAffected;
  }
  const borradores = await db.select<{ banco: string | null }>("SELECT DISTINCT json_extract(borrador, '$.draft.banco') AS banco FROM cola_depositos");
  for (const { banco } of borradores) {
    if (!banco) continue;
    const canonico = bancoCanonico(banco, conocidos);
    if (!canonico || canonico === banco) continue;
    await db.execute("UPDATE cola_depositos SET borrador = json_set(borrador, '$.draft.banco', ?) WHERE json_extract(borrador, '$.draft.banco') = ?", [canonico, banco]);
  }
  return cambiados;
}
