import type { SqlDriver } from "../driver";

export type TablaEquivalencia = "campanas" | "gerentes" | "depositos";
export type Sentido = "envio" | "recibo";

/** Emparejamientos con la otra instalación: uuid remoto → id local. */
export async function getEquivalencias(db: SqlDriver, tabla: TablaEquivalencia): Promise<Map<string, number>> {
  const rows = await db.select<{ uuid: string; id: number }>("SELECT uuid_remoto AS uuid, id_local AS id FROM equivalencias WHERE tabla = ?", [tabla]);
  return new Map(rows.map((r) => [r.uuid, r.id]));
}

export async function setEquivalencia(db: SqlDriver, tabla: TablaEquivalencia, uuidRemoto: string, idLocal: number): Promise<void> {
  await db.execute("INSERT OR REPLACE INTO equivalencias (tabla, uuid_remoto, id_local) VALUES (?, ?, ?)", [tabla, uuidRemoto, idLocal]);
}

export async function deleteEquivalencia(db: SqlDriver, tabla: TablaEquivalencia, uuidRemoto: string): Promise<void> {
  await db.execute("DELETE FROM equivalencias WHERE tabla = ? AND uuid_remoto = ?", [tabla, uuidRemoto]);
}

/** Último envío y recibo de cada asignación de la campaña. */
export async function getIntercambios(db: SqlDriver, campanaId: number): Promise<Map<number, { envio: string | null; recibo: string | null }>> {
  const rows = await db.select<{ asignacionId: number; sentido: Sentido; en: string }>(
    `SELECT c.asignacion_id AS asignacionId, c.sentido, c.en FROM consolidaciones c
     JOIN asignaciones a ON a.id = c.asignacion_id WHERE a.campana_id = ?`,
    [campanaId],
  );
  const m = new Map<number, { envio: string | null; recibo: string | null }>();
  for (const r of rows) {
    const e = m.get(r.asignacionId) ?? { envio: null, recibo: null };
    e[r.sentido] = r.en;
    m.set(r.asignacionId, e);
  }
  return m;
}

export async function marcarIntercambio(db: SqlDriver, asignacionIds: number[], sentido: Sentido, en: string): Promise<void> {
  for (const id of asignacionIds) {
    await db.execute("INSERT OR REPLACE INTO consolidaciones (asignacion_id, sentido, en) VALUES (?, ?, ?)", [id, sentido, en]);
  }
}

/** Depósitos eliminados de la campaña (por uuid), para que la otra instalación los borre al consolidar. */
export async function listEliminaciones(db: SqlDriver, campanaUuid: string): Promise<{ uuid: string; asignacionUuid: string; eliminadoEn: string }[]> {
  return db.select(
    "SELECT uuid, asignacion_uuid AS asignacionUuid, eliminado_en AS eliminadoEn FROM eliminaciones WHERE campana_uuid = ? ORDER BY eliminado_en, uuid",
    [campanaUuid],
  );
}

export async function uuidsEliminados(db: SqlDriver): Promise<Set<string>> {
  const rows = await db.select<{ uuid: string }>("SELECT uuid FROM eliminaciones");
  return new Set(rows.map((r) => r.uuid));
}
