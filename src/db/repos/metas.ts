import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "./campanas";
import { DomainError } from "@/domain/errors";
import type { Meta, MetaValida } from "@/domain/metas";

const SEL = "SELECT id, campana_id AS campanaId, monto_usd AS montoUsd, fecha, nota FROM metas";

export async function listMetas(db: SqlDriver, campanaId: number): Promise<Meta[]> {
  return db.select<Meta>(`${SEL} WHERE campana_id = ? ORDER BY fecha, id`, [campanaId]);
}

/** Las metas de todas las campañas, por campaña (lista de Campañas y Resumen). */
export async function metasPorCampana(db: SqlDriver): Promise<Map<number, Meta[]>> {
  const por = new Map<number, Meta[]>();
  for (const m of await db.select<Meta>(`${SEL} ORDER BY fecha, id`)) por.set(m.campanaId, [...(por.get(m.campanaId) ?? []), m]);
  return por;
}

async function requireMeta(db: SqlDriver, id: number): Promise<Meta> {
  const [m] = await db.select<Meta>(`${SEL} WHERE id = ?`, [id]);
  if (!m) throw new DomainError("NO_ENCONTRADO", "La meta no existe");
  return m;
}

export async function createMeta(db: SqlDriver, campanaId: number, v: MetaValida): Promise<number> {
  await assertCampanaActiva(db, campanaId);
  const now = nowIso();
  const r = await db.execute("INSERT INTO metas (campana_id, monto_usd, fecha, nota, uuid, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    campanaId,
    v.montoUsd,
    v.fecha,
    v.nota,
    crypto.randomUUID(),
    now,
    now,
  ]);
  return r.lastInsertId;
}

export async function updateMeta(db: SqlDriver, id: number, v: MetaValida): Promise<void> {
  await assertCampanaActiva(db, (await requireMeta(db, id)).campanaId);
  await db.execute("UPDATE metas SET monto_usd = ?, fecha = ?, nota = ?, actualizado_en = ? WHERE id = ?", [v.montoUsd, v.fecha, v.nota, nowIso(), id]);
}

export async function deleteMeta(db: SqlDriver, id: number): Promise<void> {
  await assertCampanaActiva(db, (await requireMeta(db, id)).campanaId);
  await db.execute("DELETE FROM metas WHERE id = ?", [id]);
}
