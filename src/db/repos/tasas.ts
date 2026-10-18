import type { SqlDriver } from "../driver";
import type { TasaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { formatFecha } from "@/domain/dates";

export type Tasa = { id: number; fecha: string; valor: string; imagenPath: string | null; notas: string | null };
export type TasaConUsos = Tasa & { usos: number };

const COLS = "t.id, t.fecha, t.valor, t.imagen_path AS imagenPath, t.notas";

export async function listTasas(db: SqlDriver): Promise<TasaConUsos[]> {
  return db.select<TasaConUsos>(
    `SELECT ${COLS}, (SELECT COUNT(*) FROM depositos d WHERE d.tasa_id = t.id) AS usos FROM tasas t ORDER BY t.fecha DESC`,
  );
}

export async function getTasa(db: SqlDriver, id: number): Promise<Tasa | null> {
  const [row] = await db.select<Tasa>(`SELECT ${COLS} FROM tasas t WHERE t.id = ?`, [id]);
  return row ?? null;
}

export async function getTasaByFecha(db: SqlDriver, fecha: string): Promise<Tasa | null> {
  const [row] = await db.select<Tasa>(`SELECT ${COLS} FROM tasas t WHERE t.fecha = ?`, [fecha]);
  return row ?? null;
}

export async function createTasa(db: SqlDriver, v: TasaValida & { imagenPath: string | null }): Promise<number> {
  if (await getTasaByFecha(db, v.fecha)) throw new DomainError("DUPLICADO", `Ya existe una tasa para el ${formatFecha(v.fecha)}`);
  const r = await db.execute("INSERT INTO tasas (fecha, valor, imagen_path, notas) VALUES (?, ?, ?, ?)", [v.fecha, v.valor, v.imagenPath, v.notas]);
  return r.lastInsertId;
}

export async function updateTasa(db: SqlDriver, id: number, v: { valor: string; notas: string | null; imagenPath: string | null }): Promise<void> {
  await db.execute("UPDATE tasas SET valor = ?, notas = ?, imagen_path = ? WHERE id = ?", [v.valor, v.notas, v.imagenPath, id]);
}

export async function countUsosTasa(db: SqlDriver, id: number): Promise<number> {
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos WHERE tasa_id = ?", [id]);
  return n;
}

export async function deleteTasa(db: SqlDriver, id: number): Promise<void> {
  const usos = await countUsosTasa(db, id);
  if (usos > 0) throw new DomainError("TASA_EN_USO", `La tasa está en uso por ${usos} depósito(s); no se puede eliminar`);
  await db.execute("DELETE FROM tasas WHERE id = ?", [id]);
}
