import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva, type EstadoCampana } from "./campanas";
import { DomainError } from "@/domain/errors";
import { creaCiclo } from "@/domain/arbol";

export type AsignacionDetalle = {
  id: number;
  campanaId: number;
  gerenteId: number;
  saldoUsd: string;
  gerenteNombre: string;
  gerenteTelefono: string | null;
  campanaNombre: string;
  campanaEstado: EstadoCampana;
  jefeId: number | null;
};

export async function getAsignacion(db: SqlDriver, id: number): Promise<AsignacionDetalle | null> {
  const [row] = await db.select<AsignacionDetalle>(
    `SELECT a.id, a.campana_id AS campanaId, a.gerente_id AS gerenteId, a.saldo_usd AS saldoUsd,
            g.nombre AS gerenteNombre, g.telefono AS gerenteTelefono, c.nombre AS campanaNombre, c.estado AS campanaEstado, a.jefe_id AS jefeId
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id JOIN campanas c ON c.id = a.campana_id
     WHERE a.id = ?`,
    [id],
  );
  return row ?? null;
}

async function requireAsignacion(db: SqlDriver, id: number): Promise<AsignacionDetalle> {
  const a = await getAsignacion(db, id);
  if (!a) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  return a;
}

export async function jefesDeCampana(db: SqlDriver, campanaId: number): Promise<Map<number, number | null>> {
  const rows = await db.select<{ id: number; jefeId: number | null }>("SELECT id, jefe_id AS jefeId FROM asignaciones WHERE campana_id = ?", [campanaId]);
  return new Map(rows.map((r) => [r.id, r.jefeId]));
}

const MOTIVO_JEFE = "El jefe tiene que ser un gerente de la misma campaña";

async function assertJefeDeCampana(db: SqlDriver, campanaId: number, jefeId: number): Promise<void> {
  const [j] = await db.select<{ campanaId: number }>("SELECT campana_id AS campanaId FROM asignaciones WHERE id = ?", [jefeId]);
  if (!j || j.campanaId !== campanaId) throw new DomainError("VALIDACION", MOTIVO_JEFE);
}

export async function createAsignacion(
  db: SqlDriver,
  v: { campanaId: number; gerenteId: number; saldoUsd: string; jefeId?: number | null },
  o: { uuid?: string } = {},
): Promise<number> {
  await assertCampanaActiva(db, v.campanaId);
  const [dup] = await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE campana_id = ? AND gerente_id = ?", [v.campanaId, v.gerenteId]);
  if (dup) throw new DomainError("DUPLICADO", "Este gerente ya está en la campaña");
  const jefeId = v.jefeId ?? null;
  if (jefeId !== null) await assertJefeDeCampana(db, v.campanaId, jefeId);
  const r = await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd, jefe_id, uuid, actualizado_en) VALUES (?, ?, ?, ?, ?, ?)", [
    v.campanaId,
    v.gerenteId,
    v.saldoUsd,
    jefeId,
    o.uuid ?? crypto.randomUUID(),
    nowIso(),
  ]);
  return r.lastInsertId;
}

export async function setJefeAsignacion(db: SqlDriver, id: number, jefeId: number | null): Promise<void> {
  const a = await requireAsignacion(db, id);
  await assertCampanaActiva(db, a.campanaId);
  if (jefeId !== null) await assertJefeDeCampana(db, a.campanaId, jefeId);
  if (creaCiclo(await jefesDeCampana(db, a.campanaId), id, jefeId)) throw new DomainError("VALIDACION", "Un gerente no puede quedar debajo de sí mismo");
  if (a.jefeId === jefeId) return;
  await db.execute("UPDATE asignaciones SET jefe_id = ?, actualizado_en = ? WHERE id = ?", [jefeId, nowIso(), id]);
}

export async function updateSaldoAsignacion(db: SqlDriver, id: number, saldoUsd: string): Promise<void> {
  const a = await requireAsignacion(db, id);
  await assertCampanaActiva(db, a.campanaId);
  await db.execute("UPDATE asignaciones SET saldo_usd = ?, actualizado_en = ? WHERE id = ?", [saldoUsd, nowIso(), id]);
}

export async function deleteAsignacion(db: SqlDriver, id: number): Promise<void> {
  const a = await requireAsignacion(db, id);
  await assertCampanaActiva(db, a.campanaId);
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos WHERE asignacion_id = ?", [id]);
  if (n > 0) throw new DomainError("VALIDACION", "No se puede quitar: el gerente tiene depósitos en esta campaña");
  // Su gente pasa al jefe de él; si el DELETE falla se repone.
  const hijos = (await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE jefe_id = ?", [id])).map((h) => h.id);
  await db.execute("UPDATE asignaciones SET jefe_id = ?, actualizado_en = ? WHERE jefe_id = ?", [a.jefeId, nowIso(), id]);
  try {
    await db.execute("DELETE FROM asignaciones WHERE id = ?", [id]);
  } catch (e) {
    for (const h of hijos) await db.execute("UPDATE asignaciones SET jefe_id = ? WHERE id = ?", [id, h]).catch(() => {});
    throw e;
  }
}
