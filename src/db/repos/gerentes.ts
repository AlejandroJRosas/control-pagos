import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import type { GerenteValido } from "@/domain/validation";

/** `nacimiento`: YYYY-MM-DD o null. */
export type Gerente = { id: number; nombre: string; telefono: string | null; nacimiento: string | null; activo: boolean; creadoEn: string };
/** `etiquetas`: ids de sus etiquetas. */
export type GerenteConCampanas = Gerente & { campanas: string[]; etiquetas: number[] };

type Row = Omit<Gerente, "activo"> & { activo: number };
const COLS = "g.id, g.nombre, g.telefono, g.nacimiento, g.activo, g.creado_en AS creadoEn";
const toGerente = ({ id, nombre, telefono, nacimiento, activo, creadoEn }: Row): Gerente => ({
  id,
  nombre,
  telefono,
  nacimiento,
  activo: activo === 1,
  creadoEn,
});
const SEP = "\u001f";

export async function listGerentes(db: SqlDriver, opts: { soloActivos?: boolean } = {}): Promise<Gerente[]> {
  const where = opts.soloActivos ? "WHERE g.activo = 1" : "";
  const rows = await db.select<Row>(`SELECT ${COLS} FROM gerentes g ${where} ORDER BY g.nombre COLLATE NOCASE`);
  return rows.map(toGerente);
}

export async function listGerentesConCampanas(db: SqlDriver): Promise<GerenteConCampanas[]> {
  const rows = await db.select<Row & { campanas: string | null; etiquetas: string | null }>(
    `SELECT ${COLS},
       (SELECT group_concat(c.nombre, char(31)) FROM asignaciones a JOIN campanas c ON c.id = a.campana_id WHERE a.gerente_id = g.id) AS campanas,
       (SELECT group_concat(ge.etiqueta_id) FROM gerente_etiquetas ge WHERE ge.gerente_id = g.id) AS etiquetas
     FROM gerentes g ORDER BY g.nombre COLLATE NOCASE`,
  );
  return rows.map((r) => ({
    ...toGerente(r),
    campanas: r.campanas ? r.campanas.split(SEP) : [],
    etiquetas: r.etiquetas ? String(r.etiquetas).split(",").map(Number) : [],
  }));
}

export async function getGerente(db: SqlDriver, id: number): Promise<Gerente | null> {
  const [row] = await db.select<Row>(`SELECT ${COLS} FROM gerentes g WHERE g.id = ?`, [id]);
  return row ? toGerente(row) : null;
}

export async function createGerente(db: SqlDriver, v: GerenteValido, o: { uuid?: string } = {}): Promise<number> {
  const now = nowIso();
  const r = await db.execute("INSERT INTO gerentes (nombre, telefono, nacimiento, activo, creado_en, uuid, actualizado_en) VALUES (?, ?, ?, 1, ?, ?, ?)", [
    v.nombre,
    v.telefono,
    v.nacimiento ?? null,
    now,
    o.uuid ?? crypto.randomUUID(),
    now,
  ]);
  return r.lastInsertId;
}

export async function updateGerente(db: SqlDriver, id: number, v: GerenteValido): Promise<void> {
  await db.execute("UPDATE gerentes SET nombre = ?, telefono = ?, nacimiento = ?, actualizado_en = ? WHERE id = ?", [
    v.nombre,
    v.telefono,
    v.nacimiento ?? null,
    nowIso(),
    id,
  ]);
}

export async function setGerenteActivo(db: SqlDriver, id: number, activo: boolean): Promise<void> {
  await db.execute("UPDATE gerentes SET activo = ?, actualizado_en = ? WHERE id = ?", [activo ? 1 : 0, nowIso(), id]);
}
