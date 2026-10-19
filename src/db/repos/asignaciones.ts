import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva, type EstadoCampana } from "./campanas";
import { DomainError } from "@/domain/errors";

export type AsignacionDetalle = {
  id: number;
  campanaId: number;
  gerenteId: number;
  saldoUsd: string;
  gerenteNombre: string;
  gerenteTelefono: string | null;
  campanaNombre: string;
  campanaEstado: EstadoCampana;
};

export async function getAsignacion(db: SqlDriver, id: number): Promise<AsignacionDetalle | null> {
  const [row] = await db.select<AsignacionDetalle>(
    `SELECT a.id, a.campana_id AS campanaId, a.gerente_id AS gerenteId, a.saldo_usd AS saldoUsd,
            g.nombre AS gerenteNombre, g.telefono AS gerenteTelefono, c.nombre AS campanaNombre, c.estado AS campanaEstado
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

export async function createAsignacion(db: SqlDriver, v: { campanaId: number; gerenteId: number; saldoUsd: string }): Promise<number> {
  await assertCampanaActiva(db, v.campanaId);
  const [dup] = await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE campana_id = ? AND gerente_id = ?", [v.campanaId, v.gerenteId]);
  if (dup) throw new DomainError("DUPLICADO", "Este gerente ya está en la campaña");
  const r = await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd, uuid, actualizado_en) VALUES (?, ?, ?, ?, ?)", [
    v.campanaId,
    v.gerenteId,
    v.saldoUsd,
    crypto.randomUUID(),
    nowIso(),
  ]);
  return r.lastInsertId;
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
  await db.execute("DELETE FROM asignaciones WHERE id = ?", [id]);
}
