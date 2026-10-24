import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { createAsignacion, jefesDeCampana, setJefeAsignacion } from "../repos/asignaciones";
import { jefesAnteriores } from "../queries/jefesAnteriores";
import { DomainError } from "@/domain/errors";
import { creaCiclo } from "@/domain/arbol";

export type GerenteAAgregar = { gerenteId: number; saldoUsd: string };

/**
 * Agrega varios gerentes a la campaña de una vez. Todo o nada: si una asignación falla, borra las
 * ya creadas (no hay transacciones entre llamadas del plugin SQL). Cada nueva queda bajo el jefe que tenía en su campaña
 * anterior, si ese gerente está en esta campaña. Devuelve las asignaciones creadas.
 */
export async function agregarGerentes(db: SqlDriver, campanaId: number, items: GerenteAAgregar[]): Promise<number[]> {
  if (items.length === 0) throw new DomainError("VALIDACION", "Elige al menos un gerente");
  if (new Set(items.map((i) => i.gerenteId)).size !== items.length) throw new DomainError("DUPLICADO", "Hay un gerente repetido en la lista");
  await assertCampanaActiva(db, campanaId);
  const creadas: number[] = [];
  try {
    for (const i of items) creadas.push(await createAsignacion(db, { campanaId, gerenteId: i.gerenteId, saldoUsd: i.saldoUsd }));
    const propuestos = await jefesAnteriores(db, campanaId, items.map((i) => i.gerenteId));
    const enCampana = new Map(creadas.map((id, k) => [items[k].gerenteId, id]));
    const previas = await db.select<{ id: number; gerenteId: number }>("SELECT id, gerente_id AS gerenteId FROM asignaciones WHERE campana_id = ?", [campanaId]);
    for (const r of previas) enCampana.set(r.gerenteId, r.id);
    const jefes = await jefesDeCampana(db, campanaId);
    for (const [k, id] of creadas.entries()) {
      const jefe = enCampana.get(propuestos.get(items[k].gerenteId) ?? -1);
      // si dos se proponían mutuamente (venían de campañas distintas), el segundo queda sin jefe en vez de fallar todo
      if (jefe === undefined || creaCiclo(jefes, id, jefe)) continue;
      await setJefeAsignacion(db, id, jefe);
      jefes.set(id, jefe);
    }
  } catch (e) {
    // primero se sueltan los vínculos entre las nuevas (jefe_id referencia asignaciones) y luego se borran; si la limpieza falla, se conserva el error original
    try {
      for (const id of creadas) await db.execute("UPDATE asignaciones SET jefe_id = NULL WHERE id = ?", [id]);
      for (const id of [...creadas].reverse()) await db.execute("DELETE FROM asignaciones WHERE id = ?", [id]);
    } catch {
      /* se relanza el error original */
    }
    throw e;
  }
  return creadas;
}
