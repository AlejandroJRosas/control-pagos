import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { createAsignacion } from "../repos/asignaciones";
import { DomainError } from "@/domain/errors";

export type GerenteAAgregar = { gerenteId: number; saldoUsd: string };

/**
 * Agrega varios gerentes a la campaña de una vez. Todo o nada: si una asignación falla, borra las
 * ya creadas (no hay transacciones entre llamadas del plugin SQL). Devuelve las asignaciones creadas.
 */
export async function agregarGerentes(db: SqlDriver, campanaId: number, items: GerenteAAgregar[]): Promise<number[]> {
  if (items.length === 0) throw new DomainError("VALIDACION", "Elige al menos un gerente");
  if (new Set(items.map((i) => i.gerenteId)).size !== items.length) throw new DomainError("DUPLICADO", "Hay un gerente repetido en la lista");
  await assertCampanaActiva(db, campanaId);
  const creadas: number[] = [];
  try {
    for (const i of items) creadas.push(await createAsignacion(db, { campanaId, gerenteId: i.gerenteId, saldoUsd: i.saldoUsd }));
  } catch (e) {
    for (const id of creadas) await db.execute("DELETE FROM asignaciones WHERE id = ?", [id]);
    throw e;
  }
  return creadas;
}
