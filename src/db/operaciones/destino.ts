import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { createAsignacion, getAsignacion } from "../repos/asignaciones";
import { createGerente, listGerentes } from "../repos/gerentes";
import { claveComparacion, createDeposito, type DepositoGuardar } from "../repos/depositos";
import type { Destino } from "@/domain/validation";
import { DomainError } from "@/domain/errors";

export type DestinoResuelto = { asignacionId: number; deshacer: () => Promise<void> };

const nada = async () => {};

/**
 * Devuelve la asignación del gerente en la campaña, creando el gerente y/o la asignación si hace falta.
 * `deshacer` borra lo creado (no hay transacciones entre llamadas del plugin SQL); llamarlo solo si
 * la asignación quedó sin depósitos.
 */
export async function resolverDestino(db: SqlDriver, campanaId: number, d: Destino): Promise<DestinoResuelto> {
  await assertCampanaActiva(db, campanaId);
  if (d.kind === "asignacion") {
    const a = await getAsignacion(db, d.asignacionId);
    if (!a || a.campanaId !== campanaId) throw new DomainError("VALIDACION", "El gerente no está en esta campaña");
    return { asignacionId: a.id, deshacer: nada };
  }

  let gerenteCreado: number | null = null;
  let gerenteId: number;
  if (d.kind === "nuevo") {
    const clave = claveComparacion(d.nombre);
    const existente = (await listGerentes(db)).find((g) => claveComparacion(g.nombre) === clave);
    if (existente) throw new DomainError("DUPLICADO", `Ya existe un gerente llamado ${existente.nombre}; selecciónalo en la lista`);
    gerenteId = gerenteCreado = await createGerente(db, { nombre: d.nombre, telefono: null });
  } else {
    gerenteId = d.gerenteId;
  }

  let asignacionId: number;
  try {
    asignacionId = await createAsignacion(db, { campanaId, gerenteId, saldoUsd: d.saldoUsd });
  } catch (e) {
    if (gerenteCreado !== null) await db.execute("DELETE FROM gerentes WHERE id = ?", [gerenteCreado]);
    throw e;
  }
  return {
    asignacionId,
    deshacer: async () => {
      await db.execute("DELETE FROM asignaciones WHERE id = ?", [asignacionId]);
      if (gerenteCreado !== null) await db.execute("DELETE FROM gerentes WHERE id = ?", [gerenteCreado]);
    },
  };
}

/** Registra un depósito desde la campaña; si falla, no deja gerente ni asignación creados a medias. Devuelve la asignación. */
export async function registrarDepositoEnCampana(db: SqlDriver, campanaId: number, d: Destino, v: DepositoGuardar): Promise<number> {
  const { asignacionId, deshacer } = await resolverDestino(db, campanaId, d);
  try {
    await createDeposito(db, asignacionId, v);
  } catch (e) {
    await deshacer();
    throw e;
  }
  return asignacionId;
}
