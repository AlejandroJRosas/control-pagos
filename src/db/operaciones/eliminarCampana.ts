import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";

export type ResumenEliminacion = { gerentes: number; depositos: number; pendientes: number };

/** Lo que se perdería al eliminar la campaña, para mostrarlo antes de confirmar. */
export async function resumenEliminacion(db: SqlDriver, campanaId: number): Promise<ResumenEliminacion> {
  const [r] = await db.select<ResumenEliminacion>(
    `SELECT
      (SELECT COUNT(*) FROM asignaciones WHERE campana_id = ?) AS gerentes,
      (SELECT COUNT(*) FROM depositos d JOIN asignaciones a ON a.id = d.asignacion_id WHERE a.campana_id = ?) AS depositos,
      (SELECT COUNT(*) FROM cola_depositos WHERE campana_id = ? AND estado = 'pendiente') AS pendientes`,
    [campanaId, campanaId, campanaId],
  );
  return r;
}

/**
 * Borra la campaña con sus asignaciones, depósitos y cola de lote. Los gerentes, las tasas y las imágenes
 * se conservan. Una campaña cerrada hay que reabrirla antes. Sin transacciones entre llamadas del plugin SQL:
 * quien llama crea un respaldo antes; el orden (hijos primero) deja la campaña a la vista si algo falla a medias.
 */
export async function eliminarCampana(db: SqlDriver, campanaId: number): Promise<void> {
  await assertCampanaActiva(db, campanaId);
  await db.execute("DELETE FROM cola_depositos WHERE campana_id = ?", [campanaId]);
  await db.execute("DELETE FROM depositos WHERE asignacion_id IN (SELECT id FROM asignaciones WHERE campana_id = ?)", [campanaId]);
  await db.execute("DELETE FROM asignaciones WHERE campana_id = ?", [campanaId]);
  await db.execute("DELETE FROM campanas WHERE id = ?", [campanaId]);
}
