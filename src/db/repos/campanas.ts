import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import type { CampanaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import type { EstadoCampana } from "@/domain/campana";

export type { EstadoCampana };
export type Campana = {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoCampana;
  notas: string | null;
  creadoEn: string;
};

const SEL = "SELECT id, nombre, fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, estado, notas, creado_en AS creadoEn FROM campanas";

export async function listCampanas(db: SqlDriver): Promise<Campana[]> {
  return db.select<Campana>(`${SEL} ORDER BY fecha_inicio DESC, id DESC`);
}

export async function getCampana(db: SqlDriver, id: number): Promise<Campana | null> {
  const [row] = await db.select<Campana>(`${SEL} WHERE id = ?`, [id]);
  return row ?? null;
}

export async function assertCampanaActiva(db: SqlDriver, campanaId: number): Promise<Campana> {
  const c = await getCampana(db, campanaId);
  if (!c) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
  if (c.estado === "cerrada") throw new DomainError("CAMPANA_CERRADA", "La campaña está cerrada; no se puede modificar");
  return c;
}

export async function createCampana(db: SqlDriver, v: CampanaValida): Promise<number> {
  const now = nowIso();
  const r = await db.execute(
    "INSERT INTO campanas (nombre, fecha_inicio, fecha_fin, estado, notas, creado_en, uuid, actualizado_en) VALUES (?, ?, ?, 'activa', ?, ?, ?, ?)",
    [v.nombre, v.fechaInicio, v.fechaFin, v.notas, now, crypto.randomUUID(), now],
  );
  return r.lastInsertId;
}

export async function updateCampana(db: SqlDriver, id: number, v: CampanaValida): Promise<void> {
  await assertCampanaActiva(db, id);
  await db.execute("UPDATE campanas SET nombre = ?, fecha_inicio = ?, fecha_fin = ?, notas = ?, actualizado_en = ? WHERE id = ?", [
    v.nombre,
    v.fechaInicio,
    v.fechaFin,
    v.notas,
    nowIso(),
    id,
  ]);
}

export async function setEstadoCampana(db: SqlDriver, id: number, estado: EstadoCampana): Promise<void> {
  await db.execute("UPDATE campanas SET estado = ?, actualizado_en = ? WHERE id = ?", [estado, nowIso(), id]);
}
