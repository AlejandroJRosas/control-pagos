import type { SqlDriver, SqlValue } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "./campanas";
import type { DepositoDraft, DestinoDraft, TasaDraft } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { autollenadoNuevo, type Autollenado } from "@/extraction/autollenado";
import type { CamposDeposito, CamposTasa } from "@/extraction/tipos";

/**
 * Colas de revisión de la subida en lote. Lo encolado no cuenta en saldos: el depósito o la tasa
 * se crean al darle "Hecho" (ver `operaciones/revision.ts`).
 */
export type EstadoCola = "pendiente" | "hecho";
/** La tasa del depósito no se guarda: se busca por fecha al revisar, como en el formulario. */
export type BorradorDeposito = { draft: Omit<DepositoDraft, "tasaId">; destino: DestinoDraft; auto: Autollenado<CamposDeposito> };
export type BorradorTasa = { draft: TasaDraft; auto: Autollenado<CamposTasa> };

type Base = {
  id: number;
  imagenPath: string;
  nombreArchivo: string | null;
  estado: EstadoCola;
  formato: string | null;
  orden: number;
  creadoEn: string;
  actualizadoEn: string;
};
export type ItemColaDeposito = Base & { campanaId: number; borrador: BorradorDeposito; depositoId: number | null };
export type ItemColaTasa = Base & { borrador: BorradorTasa; tasaId: number | null };
type Encolar<B> = { imagenPath: string; nombreArchivo: string | null; borrador: B };

export const borradorDepositoVacio = (sel = ""): BorradorDeposito => ({
  draft: { fecha: "", banco: "", referencia: "", cuentaDestino: "", montoBs: "", observaciones: "" },
  destino: { sel, nombre: "", saldo: "" },
  auto: autollenadoNuevo(),
});

export const borradorTasaVacio = (): BorradorTasa => ({ draft: { fecha: "", valor: "", notas: "" }, auto: autollenadoNuevo() });

/** Lo común a las dos colas; `enlace` es la columna del registro creado al darle "Hecho". */
type Tabla = { nombre: "cola_depositos" | "cola_tasas"; enlace: "deposito_id" | "tasa_id"; alias: "depositoId" | "tasaId" };
const DEP: Tabla = { nombre: "cola_depositos", enlace: "deposito_id", alias: "depositoId" };
const TAS: Tabla = { nombre: "cola_tasas", enlace: "tasa_id", alias: "tasaId" };

const sel = (t: Tabla) =>
  `SELECT id, ${t === DEP ? "campana_id AS campanaId, " : ""}imagen_path AS imagenPath, nombre_archivo AS nombreArchivo, estado, borrador,
   formato, ${t.enlace} AS ${t.alias}, orden, creado_en AS creadoEn, actualizado_en AS actualizadoEn FROM ${t.nombre}`;

type Fila = Record<string, unknown> & { borrador: string };
const parse = <T>(r: Fila): T => ({ ...r, borrador: JSON.parse(r.borrador) }) as T;

async function insertar(db: SqlDriver, t: Tabla, v: Encolar<unknown>, campanaId?: number): Promise<number> {
  const filtro = campanaId === undefined ? "" : " WHERE campana_id = ?";
  const params: SqlValue[] = campanaId === undefined ? [] : [campanaId];
  const [{ orden }] = await db.select<{ orden: number }>(`SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM ${t.nombre}${filtro}`, params);
  const now = nowIso();
  const cols = campanaId === undefined ? "" : "campana_id, ";
  const r = await db.execute(
    `INSERT INTO ${t.nombre} (${cols}imagen_path, nombre_archivo, borrador, orden, creado_en, actualizado_en) VALUES (${campanaId === undefined ? "" : "?, "}?, ?, ?, ?, ?, ?)`,
    [...params, v.imagenPath, v.nombreArchivo, JSON.stringify(v.borrador), orden, now, now],
  );
  return r.lastInsertId;
}

async function getFila(db: SqlDriver, t: Tabla, id: number): Promise<Fila | null> {
  const [row] = await db.select<Fila>(`${sel(t)} WHERE id = ?`, [id]);
  return row ?? null;
}

async function assertPendiente(db: SqlDriver, t: Tabla, id: number): Promise<Fila> {
  const row = await getFila(db, t, id);
  if (!row) throw new DomainError("NO_ENCONTRADO", "El elemento ya no está en la cola");
  if (row.estado !== "pendiente") throw new DomainError("VALIDACION", "Este elemento ya está hecho");
  return row;
}

async function guardarBorrador(db: SqlDriver, t: Tabla, id: number, borrador: unknown, formato?: string | null): Promise<void> {
  await assertPendiente(db, t, id);
  const conFormato = formato === undefined ? "" : ", formato = ?";
  const params: SqlValue[] = formato === undefined ? [] : [formato];
  await db.execute(`UPDATE ${t.nombre} SET borrador = ?${conFormato}, actualizado_en = ? WHERE id = ?`, [JSON.stringify(borrador), ...params, nowIso(), id]);
}

/** `borrador`: lo que se guardó, para que la cola muestre lo mismo que el registro creado. */
async function marcarHecho(db: SqlDriver, t: Tabla, id: number, registroId: number, borrador?: unknown): Promise<void> {
  const row = await assertPendiente(db, t, id);
  // La condición sobre el estado evita marcar dos veces si dos "Hecho" corren a la vez.
  const r = await db.execute(
    `UPDATE ${t.nombre} SET estado = 'hecho', ${t.enlace} = ?, borrador = ?, actualizado_en = ? WHERE id = ? AND estado = 'pendiente'`,
    [registroId, borrador === undefined ? row.borrador : JSON.stringify(borrador), nowIso(), id],
  );
  if (r.rowsAffected === 0) throw new DomainError("VALIDACION", "Este elemento ya está hecho");
}

async function descartar(db: SqlDriver, t: Tabla, id: number): Promise<string> {
  const row = await assertPendiente(db, t, id);
  await db.execute(`DELETE FROM ${t.nombre} WHERE id = ?`, [id]);
  return row.imagenPath as string;
}

/** Varios pendientes de una vez: si alguno ya no se puede descartar no se toca ninguno. Devuelve sus imágenes. */
async function descartarVarios(db: SqlDriver, t: Tabla, ids: number[]): Promise<string[]> {
  const filas = [];
  for (const id of ids) filas.push(await assertPendiente(db, t, id));
  for (const id of ids) await db.execute(`DELETE FROM ${t.nombre} WHERE id = ? AND estado = 'pendiente'`, [id]);
  return filas.map((r) => r.imagenPath as string);
}

/** Saca de la cola un elemento hecho (el registro creado y su imagen quedan). */
async function quitarHecho(db: SqlDriver, t: Tabla, id: number): Promise<void> {
  const r = await db.execute(`DELETE FROM ${t.nombre} WHERE id = ? AND estado = 'hecho'`, [id]);
  if (r.rowsAffected === 0) throw new DomainError("VALIDACION", "Solo se pueden quitar de la cola los elementos hechos");
}

async function quitarHechos(db: SqlDriver, t: Tabla, campanaId?: number): Promise<number> {
  const r = await db.execute(
    `DELETE FROM ${t.nombre} WHERE estado = 'hecho'${campanaId === undefined ? "" : " AND campana_id = ?"}`,
    campanaId === undefined ? [] : [campanaId],
  );
  return r.rowsAffected;
}

async function contarPendientes(db: SqlDriver, t: Tabla, campanaId?: number): Promise<number> {
  const [{ n }] = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${t.nombre} WHERE estado = 'pendiente'${campanaId === undefined ? "" : " AND campana_id = ?"}`,
    campanaId === undefined ? [] : [campanaId],
  );
  return n;
}

// Depósitos

export async function encolarDeposito(db: SqlDriver, campanaId: number, v: Encolar<BorradorDeposito>): Promise<number> {
  await assertCampanaActiva(db, campanaId);
  return insertar(db, DEP, v, campanaId);
}

export async function listColaDepositos(db: SqlDriver, campanaId: number): Promise<ItemColaDeposito[]> {
  const rows = await db.select<Fila>(`${sel(DEP)} WHERE campana_id = ? ORDER BY orden, id`, [campanaId]);
  return rows.map((r) => parse<ItemColaDeposito>(r));
}

export async function getItemColaDeposito(db: SqlDriver, id: number): Promise<ItemColaDeposito | null> {
  const row = await getFila(db, DEP, id);
  return row ? parse<ItemColaDeposito>(row) : null;
}

/** `formato` sin indicar = no se cambia. */
export const guardarBorradorDeposito = (db: SqlDriver, id: number, borrador: BorradorDeposito, formato?: string | null) =>
  guardarBorrador(db, DEP, id, borrador, formato);

/** Pone el gerente `sel` ("a:<asignaciónId>") a los pendientes de `ids`; los hechos no se tocan. Devuelve cuántos cambió. */
export async function asignarGerenteCola(db: SqlDriver, ids: number[], sel: string): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const item = await getItemColaDeposito(db, id);
    if (!item || item.estado !== "pendiente") continue;
    await guardarBorradorDeposito(db, id, { ...item.borrador, destino: { sel, nombre: "", saldo: "" } });
    n += 1;
  }
  return n;
}

export const marcarDepositoHecho = (db: SqlDriver, id: number, depositoId: number, borrador?: BorradorDeposito) => marcarHecho(db, DEP, id, depositoId, borrador);
/** Borra un pendiente y devuelve su imagen (la borra quien llama). */
export const descartarDeposito = (db: SqlDriver, id: number) => descartar(db, DEP, id);
export const descartarDepositos = (db: SqlDriver, ids: number[]) => descartarVarios(db, DEP, ids);
export const quitarHechoDeposito = (db: SqlDriver, id: number) => quitarHecho(db, DEP, id);
export const quitarHechosDepositos = (db: SqlDriver, campanaId: number) => quitarHechos(db, DEP, campanaId);
export const contarPendientesDepositos = (db: SqlDriver, campanaId: number) => contarPendientes(db, DEP, campanaId);

// Tasas

export const encolarTasa = (db: SqlDriver, v: Encolar<BorradorTasa>) => insertar(db, TAS, v);

export async function listColaTasas(db: SqlDriver): Promise<ItemColaTasa[]> {
  const rows = await db.select<Fila>(`${sel(TAS)} ORDER BY orden, id`);
  return rows.map((r) => parse<ItemColaTasa>(r));
}

export async function getItemColaTasa(db: SqlDriver, id: number): Promise<ItemColaTasa | null> {
  const row = await getFila(db, TAS, id);
  return row ? parse<ItemColaTasa>(row) : null;
}

export const guardarBorradorTasa = (db: SqlDriver, id: number, borrador: BorradorTasa, formato?: string | null) => guardarBorrador(db, TAS, id, borrador, formato);
export const marcarTasaHecha = (db: SqlDriver, id: number, tasaId: number, borrador?: BorradorTasa) => marcarHecho(db, TAS, id, tasaId, borrador);
export const descartarTasa = (db: SqlDriver, id: number) => descartar(db, TAS, id);
export const quitarHechoTasa = (db: SqlDriver, id: number) => quitarHecho(db, TAS, id);
export const quitarHechosTasas = (db: SqlDriver) => quitarHechos(db, TAS);
export const contarPendientesTasas = (db: SqlDriver) => contarPendientes(db, TAS);
