import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "./campanas";
import { getAsignacion } from "./asignaciones";
import { getTasa } from "./tasas";
import type { DepositoValido } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { formatFecha } from "@/domain/dates";

export type Deposito = {
  id: number;
  asignacionId: number;
  tasaId: number;
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  observaciones: string | null;
  imagenPath: string | null;
  creadoEn: string;
  actualizadoEn: string;
};
export type DepositoGuardar = DepositoValido & { imagenPath: string | null };
export type Duplicado = { id: number; fecha: string; montoBs: string; gerenteNombre: string; campanaNombre: string };

const SEL = `SELECT id, asignacion_id AS asignacionId, tasa_id AS tasaId, fecha, banco, referencia, cuenta_destino AS cuentaDestino,
  monto_bs AS montoBs, observaciones, imagen_path AS imagenPath, creado_en AS creadoEn, actualizado_en AS actualizadoEn FROM depositos`;

export async function getDeposito(db: SqlDriver, id: number): Promise<Deposito | null> {
  const [row] = await db.select<Deposito>(`${SEL} WHERE id = ?`, [id]);
  return row ?? null;
}

async function assertEditable(db: SqlDriver, asignacionId: number): Promise<void> {
  const a = await getAsignacion(db, asignacionId);
  if (!a) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  await assertCampanaActiva(db, a.campanaId);
}

async function assertTasaDeLaFecha(db: SqlDriver, v: DepositoGuardar): Promise<void> {
  const tasa = await getTasa(db, v.tasaId);
  if (!tasa) throw new DomainError("VALIDACION", "La tasa seleccionada no existe");
  if (tasa.fecha !== v.fecha) {
    throw new DomainError("VALIDACION", `La tasa es del ${formatFecha(tasa.fecha)} y el depósito del ${formatFecha(v.fecha)}`);
  }
}

export async function createDeposito(db: SqlDriver, asignacionId: number, v: DepositoGuardar): Promise<number> {
  await assertEditable(db, asignacionId);
  await assertTasaDeLaFecha(db, v);
  const now = nowIso();
  const r = await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, observaciones, imagen_path, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [asignacionId, v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath, now, now],
  );
  return r.lastInsertId;
}

async function requireDeposito(db: SqlDriver, id: number): Promise<Deposito> {
  const d = await getDeposito(db, id);
  if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
  return d;
}

export async function updateDeposito(db: SqlDriver, id: number, v: DepositoGuardar): Promise<void> {
  const actual = await requireDeposito(db, id);
  await assertEditable(db, actual.asignacionId);
  await assertTasaDeLaFecha(db, v);
  await db.execute(
    `UPDATE depositos SET tasa_id = ?, fecha = ?, banco = ?, referencia = ?, cuenta_destino = ?, monto_bs = ?,
       observaciones = ?, imagen_path = ?, actualizado_en = ? WHERE id = ?`,
    [v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath, nowIso(), id],
  );
}

export async function deleteDeposito(db: SqlDriver, id: number): Promise<void> {
  const actual = await requireDeposito(db, id);
  await assertEditable(db, actual.asignacionId);
  await db.execute("DELETE FROM depositos WHERE id = ?", [id]);
}

/** Clave de comparación: sin mayúsculas, acentos ni espacios (SQLite `lower` solo pliega ASCII). */
export const claveComparacion = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "")
    .toLowerCase();

export async function findDuplicados(db: SqlDriver, banco: string, referencia: string, excludeId?: number): Promise<Duplicado[]> {
  const rows = await db.select<Duplicado & { banco: string; referencia: string }>(
    `SELECT d.id, d.fecha, d.monto_bs AS montoBs, g.nombre AS gerenteNombre, c.nombre AS campanaNombre, d.banco, d.referencia
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN gerentes g ON g.id = a.gerente_id
     JOIN campanas c ON c.id = a.campana_id
     WHERE d.id != ?
     ORDER BY d.fecha`,
    [excludeId ?? -1],
  );
  const kBanco = claveComparacion(banco);
  const kRef = claveComparacion(referencia);
  return rows
    .filter((r) => claveComparacion(r.banco) === kBanco && claveComparacion(r.referencia) === kRef)
    .map(({ id, fecha, montoBs, gerenteNombre, campanaNombre }) => ({ id, fecha, montoBs, gerenteNombre, campanaNombre }));
}

export async function listBancosUsados(db: SqlDriver): Promise<string[]> {
  const rows = await db.select<{ banco: string }>("SELECT DISTINCT trim(banco) AS banco FROM depositos ORDER BY banco COLLATE NOCASE");
  return rows.map((r) => r.banco);
}
