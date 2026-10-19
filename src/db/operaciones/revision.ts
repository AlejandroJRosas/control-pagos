import type { SqlDriver } from "../driver";
import { createDeposito, getDeposito, updateDeposito, type DepositoGuardar } from "../repos/depositos";
import { createTasa, deleteTasa } from "../repos/tasas";
import { getItemColaDeposito, getItemColaTasa, marcarDepositoHecho, marcarTasaHecha, type BorradorDeposito, type BorradorTasa } from "../repos/cola";
import { resolverDestino } from "./destino";
import type { Destino, DepositoValido, TasaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";

function assertPendiente(item: { estado: string } | null): void {
  if (!item) throw new DomainError("NO_ENCONTRADO", "El elemento ya no está en la cola");
  if (item.estado !== "pendiente") throw new DomainError("VALIDACION", "Este elemento ya está hecho");
}

/**
 * "Hecho" en la revisión de depósitos: guarda el depósito con la imagen de la cola y marca el elemento
 * (con `borrador`, el final que se guardó, aunque el autoguardado no haya alcanzado a escribirlo).
 * Si algo falla no deja depósito, gerente ni asignación a medias y el elemento sigue pendiente.
 */
export async function completarDeposito(
  db: SqlDriver,
  itemId: number,
  v: DepositoValido,
  destino: Destino,
  borrador?: BorradorDeposito,
): Promise<{ depositoId: number; asignacionId: number }> {
  const item = await getItemColaDeposito(db, itemId);
  assertPendiente(item);
  const { asignacionId, deshacer } = await resolverDestino(db, item!.campanaId, destino);
  let depositoId: number;
  try {
    depositoId = await createDeposito(db, asignacionId, { ...v, imagenPath: item!.imagenPath });
  } catch (e) {
    await deshacer();
    throw e;
  }
  try {
    await marcarDepositoHecho(db, itemId, depositoId, borrador);
  } catch (e) {
    await db.execute("DELETE FROM depositos WHERE id = ?", [depositoId]);
    await deshacer();
    throw e;
  }
  return { depositoId, asignacionId };
}

/** "Hecho" en la revisión de tasas: registra la tasa con la imagen de la cola y marca el elemento. */
export async function completarTasa(db: SqlDriver, itemId: number, v: TasaValida, borrador?: BorradorTasa): Promise<number> {
  const item = await getItemColaTasa(db, itemId);
  assertPendiente(item);
  const tasaId = await createTasa(db, { ...v, imagenPath: item!.imagenPath });
  try {
    await marcarTasaHecha(db, itemId, tasaId, borrador);
  } catch (e) {
    await deleteTasa(db, tasaId);
    throw e;
  }
  return tasaId;
}

/**
 * "Actualizar" ante un duplicado: el depósito que ya existe toma los datos nuevos (sigue con su gerente y campaña).
 * Sin imagen u observaciones nuevas conserva las suyas. Devuelve cómo estaba, para revertir.
 */
export async function actualizarDuplicado(db: SqlDriver, depositoId: number, v: DepositoGuardar): Promise<DepositoGuardar> {
  const actual = await getDeposito(db, depositoId);
  if (!actual) throw new DomainError("NO_ENCONTRADO", "El depósito ya no existe");
  await updateDeposito(db, depositoId, { ...v, observaciones: v.observaciones ?? actual.observaciones, imagenPath: v.imagenPath ?? actual.imagenPath });
  const { fecha, banco, referencia, cuentaDestino, montoBs, tasaId, observaciones, imagenPath } = actual;
  return { fecha, banco, referencia, cuentaDestino, montoBs, tasaId, observaciones, imagenPath };
}

/** "Actualizar" en la revisión: el duplicado existente toma los datos y la imagen del comprobante, y el elemento queda hecho apuntando a él. */
export async function completarConDuplicado(db: SqlDriver, itemId: number, depositoId: number, v: DepositoValido, borrador?: BorradorDeposito): Promise<void> {
  const item = await getItemColaDeposito(db, itemId);
  assertPendiente(item);
  const antes = await actualizarDuplicado(db, depositoId, { ...v, imagenPath: item!.imagenPath });
  try {
    await marcarDepositoHecho(db, itemId, depositoId, borrador);
  } catch (e) {
    await updateDeposito(db, depositoId, antes);
    throw e;
  }
}
