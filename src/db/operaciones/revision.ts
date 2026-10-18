import type { SqlDriver } from "../driver";
import { createDeposito } from "../repos/depositos";
import { createTasa, deleteTasa } from "../repos/tasas";
import { getItemColaDeposito, getItemColaTasa, marcarDepositoHecho, marcarTasaHecha } from "../repos/cola";
import { resolverDestino } from "./destino";
import type { Destino, DepositoValido, TasaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";

function assertPendiente(item: { estado: string } | null): void {
  if (!item) throw new DomainError("NO_ENCONTRADO", "El elemento ya no está en la cola");
  if (item.estado !== "pendiente") throw new DomainError("VALIDACION", "Este elemento ya está hecho");
}

/**
 * "Hecho" en la revisión de depósitos: guarda el depósito con la imagen de la cola y marca el elemento.
 * Si algo falla no deja depósito, gerente ni asignación a medias y el elemento sigue pendiente.
 */
export async function completarDeposito(db: SqlDriver, itemId: number, v: DepositoValido, destino: Destino): Promise<{ depositoId: number; asignacionId: number }> {
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
    await marcarDepositoHecho(db, itemId, depositoId);
  } catch (e) {
    await db.execute("DELETE FROM depositos WHERE id = ?", [depositoId]);
    await deshacer();
    throw e;
  }
  return { depositoId, asignacionId };
}

/** "Hecho" en la revisión de tasas: registra la tasa con la imagen de la cola y marca el elemento. */
export async function completarTasa(db: SqlDriver, itemId: number, v: TasaValida): Promise<number> {
  const item = await getItemColaTasa(db, itemId);
  assertPendiente(item);
  const tasaId = await createTasa(db, { ...v, imagenPath: item!.imagenPath });
  try {
    await marcarTasaHecha(db, itemId, tasaId);
  } catch (e) {
    await deleteTasa(db, tasaId);
    throw e;
  }
  return tasaId;
}
