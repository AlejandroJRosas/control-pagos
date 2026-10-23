import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "./campanas";
import { getAsignacion } from "./asignaciones";
import { getTasa } from "./tasas";
import { feriadosSet } from "./feriados";
import type { DepositoValido } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { fechaDeTasa, formatFecha } from "@/domain/dates";
import { claveComparacion } from "@/domain/texto";
import { claveDuplicado } from "@/domain/bancos";

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
  uuid: string;
};
export type DepositoGuardar = DepositoValido & { imagenPath: string | null };
export type Duplicado = {
  id: number;
  asignacionId: number;
  fecha: string;
  banco: string;
  referencia: string;
  montoBs: string;
  observaciones: string | null;
  imagenPath: string | null;
  gerenteNombre: string;
  campanaNombre: string;
  campanaEstado: "activa" | "cerrada";
};

const SEL = `SELECT id, asignacion_id AS asignacionId, tasa_id AS tasaId, fecha, banco, referencia, cuenta_destino AS cuentaDestino,
  monto_bs AS montoBs, observaciones, imagen_path AS imagenPath, creado_en AS creadoEn, actualizado_en AS actualizadoEn, uuid FROM depositos`;

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
  if (tasa.fecha !== v.fecha && tasa.fecha !== fechaDeTasa(v.fecha, await feriadosSet(db))) {
    throw new DomainError("VALIDACION", `La tasa es del ${formatFecha(tasa.fecha)} y el depósito del ${formatFecha(v.fecha)}`);
  }
}

/** No puede haber dos depósitos con el mismo banco y referencia (`claveDuplicado`). */
async function assertNoDuplicado(db: SqlDriver, v: DepositoGuardar, excludeId?: number): Promise<void> {
  const [d] = await findDuplicados(db, v.banco, v.referencia, excludeId);
  if (d) {
    throw new DomainError(
      "DUPLICADO",
      `Ya existe un depósito de ${d.banco} con la referencia ${d.referencia} (${formatFecha(d.fecha)}, ${d.gerenteNombre}, ${d.campanaNombre})`,
    );
  }
}

/** Al consolidar, el depósito conserva el uuid y las fechas que traía de la otra instalación. */
export async function createDeposito(
  db: SqlDriver,
  asignacionId: number,
  v: DepositoGuardar,
  meta?: { uuid: string; creadoEn: string; actualizadoEn: string },
): Promise<number> {
  await assertEditable(db, asignacionId);
  await assertTasaDeLaFecha(db, v);
  await assertNoDuplicado(db, v);
  const now = nowIso();
  const r = await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, observaciones, imagen_path, creado_en, actualizado_en, uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [asignacionId, v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath,
      meta?.creadoEn ?? now, meta?.actualizadoEn ?? now, meta?.uuid ?? crypto.randomUUID()],
  );
  return r.lastInsertId;
}

async function requireDeposito(db: SqlDriver, id: number): Promise<Deposito> {
  const d = await getDeposito(db, id);
  if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
  return d;
}

export async function updateDeposito(db: SqlDriver, id: number, v: DepositoGuardar, meta?: { actualizadoEn: string; asignacionId?: number }): Promise<void> {
  const actual = await requireDeposito(db, id);
  await assertEditable(db, actual.asignacionId);
  if (meta?.asignacionId !== undefined) await assertEditable(db, meta.asignacionId);
  await assertTasaDeLaFecha(db, v);
  // Un duplicado que ya existía (de antes de esta regla) se puede seguir editando mientras no cambie su banco o referencia.
  if (claveDuplicado(v.banco, v.referencia) !== claveDuplicado(actual.banco, actual.referencia)) await assertNoDuplicado(db, v, id);
  await db.execute(
    `UPDATE depositos SET tasa_id = ?, fecha = ?, banco = ?, referencia = ?, cuenta_destino = ?, monto_bs = ?,
       observaciones = ?, imagen_path = ?, actualizado_en = ?, asignacion_id = ? WHERE id = ?`,
    [v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath, meta?.actualizadoEn ?? nowIso(), meta?.asignacionId ?? actual.asignacionId, id],
  );
}

/** Lo que hace falta para deshacer una eliminación: las filas tal cual y los enlaces de la cola de revisión. */
export type Eliminados = { depositos: Deposito[]; cola: { id: number; depositoId: number }[] };

export const deleteDeposito = (db: SqlDriver, id: number): Promise<Eliminados> => deleteDepositos(db, [id]);

/** Elimina todos o ninguno: primero se comprueba que cada uno exista y sea editable. */
export async function deleteDepositos(db: SqlDriver, ids: number[]): Promise<Eliminados> {
  if (ids.length === 0) return { depositos: [], cola: [] };
  const depositos: Deposito[] = [];
  for (const id of ids) {
    const d = await requireDeposito(db, id);
    await assertEditable(db, d.asignacionId);
    depositos.push(d);
  }
  const marcas = ids.map(() => "?").join(", ");
  const origen = await db.select<{ uuid: string; campanaUuid: string; asignacionUuid: string }>(
    `SELECT d.uuid, c.uuid AS campanaUuid, a.uuid AS asignacionUuid FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id JOIN campanas c ON c.id = a.campana_id WHERE d.id IN (${marcas})`,
    ids,
  );
  const cola = await db.select<{ id: number; depositoId: number }>(
    `SELECT id, deposito_id AS depositoId FROM cola_depositos WHERE deposito_id IN (${marcas})`,
    ids,
  );
  await db.execute(`DELETE FROM depositos WHERE id IN (${marcas})`, ids);
  const en = nowIso();
  for (const o of origen) {
    await db.execute(
      "INSERT OR REPLACE INTO eliminaciones (uuid, tabla, campana_uuid, asignacion_uuid, eliminado_en) VALUES (?, 'depositos', ?, ?, ?)",
      [o.uuid, o.campanaUuid, o.asignacionUuid, en],
    );
  }
  return { depositos, cola };
}

/** Deshace `deleteDepositos`: vuelve a insertar las filas con su id. Todos o ninguno. */
export async function restaurarDepositos(db: SqlDriver, e: Eliminados): Promise<void> {
  for (const d of e.depositos) {
    await assertEditable(db, d.asignacionId);
    if (!(await getTasa(db, d.tasaId))) throw new DomainError("NO_ENCONTRADO", "La tasa del depósito ya no existe");
    if (await getDeposito(db, d.id)) throw new DomainError("VALIDACION", "El depósito ya fue restaurado");
  }
  const insertados: number[] = [];
  try {
    for (const d of e.depositos) {
      await db.execute(
        `INSERT INTO depositos (id, asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, observaciones, imagen_path, creado_en, actualizado_en, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.asignacionId, d.tasaId, d.fecha, d.banco, d.referencia, d.cuentaDestino, d.montoBs, d.observaciones, d.imagenPath, d.creadoEn, d.actualizadoEn, d.uuid],
      );
      insertados.push(d.id);
    }
  } catch (err) {
    if (insertados.length > 0) await db.execute(`DELETE FROM depositos WHERE id IN (${insertados.map(() => "?").join(", ")})`, insertados);
    throw err;
  }
  if (e.depositos.length > 0) await db.execute(`DELETE FROM eliminaciones WHERE uuid IN (${e.depositos.map(() => "?").join(", ")})`, e.depositos.map((d) => d.uuid));
  // El enlace de la cola es informativo: si el elemento ya no existe, no pasa nada.
  for (const c of e.cola) await db.execute("UPDATE cola_depositos SET deposito_id = ? WHERE id = ? AND deposito_id IS NULL", [c.depositoId, c.id]);
}

/** Clave de comparación: sin mayúsculas, acentos ni espacios (SQLite `lower` solo pliega ASCII). */
export { claveComparacion };

export async function findDuplicados(db: SqlDriver, banco: string, referencia: string, excludeId?: number): Promise<Duplicado[]> {
  const rows = await db.select<Duplicado>(
    `SELECT d.id, d.asignacion_id AS asignacionId, d.fecha, d.banco, d.referencia, d.monto_bs AS montoBs, d.observaciones,
            d.imagen_path AS imagenPath, g.nombre AS gerenteNombre, c.nombre AS campanaNombre, c.estado AS campanaEstado
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN gerentes g ON g.id = a.gerente_id
     JOIN campanas c ON c.id = a.campana_id
     WHERE d.id != ?
     ORDER BY d.fecha`,
    [excludeId ?? -1],
  );
  const clave = claveDuplicado(banco, referencia);
  if (!clave) return [];
  return rows.filter((r) => claveDuplicado(r.banco, r.referencia) === clave);
}

export async function listBancosUsados(db: SqlDriver): Promise<string[]> {
  const rows = await db.select<{ banco: string }>("SELECT DISTINCT trim(banco) AS banco FROM depositos ORDER BY banco COLLATE NOCASE");
  return rows.map((r) => r.banco);
}

export async function listCuentasDestinoUsadas(db: SqlDriver): Promise<string[]> {
  const rows = await db.select<{ cuenta: string }>("SELECT DISTINCT trim(cuenta_destino) AS cuenta FROM depositos ORDER BY cuenta");
  return rows.map((r) => r.cuenta);
}
