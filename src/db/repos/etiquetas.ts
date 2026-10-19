import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { DomainError } from "@/domain/errors";
import type { ColorEtiqueta, EtiquetaValida } from "@/domain/etiquetas";
import { claveComparacion } from "@/domain/texto";

export type Etiqueta = { id: number; nombre: string; color: ColorEtiqueta };
export type EtiquetaConUso = Etiqueta & { gerentes: number };

export async function listEtiquetas(db: SqlDriver): Promise<EtiquetaConUso[]> {
  return db.select<EtiquetaConUso>(
    `SELECT e.id, e.nombre, e.color, (SELECT COUNT(*) FROM gerente_etiquetas ge WHERE ge.etiqueta_id = e.id) AS gerentes
     FROM etiquetas e ORDER BY e.nombre COLLATE NOCASE`,
  );
}

/** "Mérida" y "merida" son la misma etiqueta (el UNIQUE de la tabla solo ignora mayúsculas). */
async function exigirNombreLibre(db: SqlDriver, nombre: string, salvo?: number): Promise<void> {
  const k = claveComparacion(nombre);
  const otras = await db.select<{ id: number; nombre: string }>("SELECT id, nombre FROM etiquetas");
  const igual = otras.find((e) => e.id !== salvo && claveComparacion(e.nombre) === k);
  if (igual) throw new DomainError("DUPLICADO", `Ya existe la etiqueta "${igual.nombre}"`);
}

export async function createEtiqueta(db: SqlDriver, v: EtiquetaValida): Promise<number> {
  await exigirNombreLibre(db, v.nombre);
  const now = nowIso();
  const r = await db.execute("INSERT INTO etiquetas (nombre, color, creado_en, uuid, actualizado_en) VALUES (?, ?, ?, ?, ?)", [
    v.nombre,
    v.color,
    now,
    crypto.randomUUID(),
    now,
  ]);
  return r.lastInsertId;
}

export async function updateEtiqueta(db: SqlDriver, id: number, v: EtiquetaValida): Promise<void> {
  await exigirNombreLibre(db, v.nombre, id);
  await db.execute("UPDATE etiquetas SET nombre = ?, color = ?, actualizado_en = ? WHERE id = ?", [v.nombre, v.color, nowIso(), id]);
}

/** Quita la etiqueta de todos los gerentes (ON DELETE CASCADE). */
export async function deleteEtiqueta(db: SqlDriver, id: number): Promise<void> {
  await db.execute("DELETE FROM etiquetas WHERE id = ?", [id]);
}

export async function etiquetasDeGerente(db: SqlDriver, gerenteId: number): Promise<number[]> {
  const rows = await db.select<{ id: number }>(
    `SELECT e.id FROM gerente_etiquetas ge JOIN etiquetas e ON e.id = ge.etiqueta_id
     WHERE ge.gerente_id = ? ORDER BY e.nombre COLLATE NOCASE`,
    [gerenteId],
  );
  return rows.map((r) => r.id);
}

/** Reemplaza las etiquetas del gerente por `ids`. */
export async function setEtiquetasGerente(db: SqlDriver, gerenteId: number, ids: number[]): Promise<void> {
  const antes = await etiquetasDeGerente(db, gerenteId);
  const quitar = antes.filter((id) => !ids.includes(id));
  const agregar = [...new Set(ids)].filter((id) => !antes.includes(id));
  if (quitar.length === 0 && agregar.length === 0) return;
  for (const id of quitar) await db.execute("DELETE FROM gerente_etiquetas WHERE gerente_id = ? AND etiqueta_id = ?", [gerenteId, id]);
  for (const id of agregar) await db.execute("INSERT INTO gerente_etiquetas (gerente_id, etiqueta_id) VALUES (?, ?)", [gerenteId, id]);
  await db.execute("UPDATE gerentes SET actualizado_en = ? WHERE id = ?", [nowIso(), gerenteId]);
}
