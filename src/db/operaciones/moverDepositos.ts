import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "../repos/campanas";
import { getAsignacion } from "../repos/asignaciones";
import { getDeposito } from "../repos/depositos";
import { DomainError } from "@/domain/errors";

/** Dónde estaba cada depósito antes de moverlo (para deshacer con `restaurarMovidos`). */
export type Movidos = { id: number; asignacionId: number; actualizadoEn: string }[];

async function comprobar(db: SqlDriver, ids: number[], asignacionId: number): Promise<Movidos> {
  const destino = await getAsignacion(db, asignacionId);
  if (!destino) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
  await assertCampanaActiva(db, destino.campanaId);
  const previos: Movidos = [];
  for (const id of ids) {
    const d = await getDeposito(db, id);
    if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
    const origen = await getAsignacion(db, d.asignacionId);
    if (origen?.campanaId !== destino.campanaId) throw new DomainError("VALIDACION", "Los depósitos solo se pasan a un gerente de la misma campaña");
    previos.push({ id, asignacionId: d.asignacionId, actualizadoEn: d.actualizadoEn });
  }
  return previos;
}

/**
 * Pasa depósitos a otro gerente de la misma campaña. Todo o nada. Quedan como editados ahora, así al consolidar llegan
 * como corrección de gerente; el uuid, la fecha y la tasa no cambian.
 */
export async function moverDepositos(db: SqlDriver, ids: number[], asignacionId: number): Promise<Movidos> {
  if (ids.length === 0) throw new DomainError("VALIDACION", "Elige al menos un depósito");
  const previos = await comprobar(db, ids, asignacionId);
  await db.execute(`UPDATE depositos SET asignacion_id = ?, actualizado_en = ? WHERE id IN (${ids.map(() => "?").join(", ")})`, [
    asignacionId,
    nowIso(),
    ...ids,
  ]);
  return previos;
}

/** Deshace `moverDepositos`: cada uno vuelve a su gerente y a su fecha de edición. */
export async function restaurarMovidos(db: SqlDriver, movidos: Movidos): Promise<void> {
  for (const m of movidos) {
    const d = await getDeposito(db, m.id);
    if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito ya no existe");
    const a = await getAsignacion(db, m.asignacionId);
    if (!a) throw new DomainError("NO_ENCONTRADO", "El gerente ya no está en esta campaña");
    await assertCampanaActiva(db, a.campanaId);
  }
  for (const m of movidos) {
    await db.execute("UPDATE depositos SET asignacion_id = ?, actualizado_en = ? WHERE id = ?", [m.asignacionId, m.actualizadoEn, m.id]);
  }
}
