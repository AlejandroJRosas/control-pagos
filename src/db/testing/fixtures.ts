import type { SqlDriver } from "../driver";
import { createCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createTasa } from "../repos/tasas";
import { createDeposito, type DepositoGuardar } from "../repos/depositos";

export async function seedBasico(db: SqlDriver) {
  const campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  const anaId = await createGerente(db, { nombre: "Ana", telefono: null });
  const asignacionId = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  const tasaId = await createTasa(db, { fecha: "2026-03-02", valor: "36.5", notas: null, imagenPath: null });
  return { campanaId, anaId, asignacionId, tasaId };
}

export const depositoBase = (tasaId: number, o: Partial<DepositoGuardar> = {}): DepositoGuardar => ({
  fecha: "2026-03-02",
  banco: "Banesco",
  referencia: "123",
  cuentaDestino: "0102-0000-00-0000000000",
  montoBs: "3650",
  tasaId,
  observaciones: null,
  imagenPath: null,
  ...o,
});

/** Depósito que choca con otro (como los que quedaron de antes de bloquear duplicados): se salta la regla escribiendo la referencia con SQL. */
export async function crearDuplicado(db: SqlDriver, asignacionId: number, v: DepositoGuardar): Promise<number> {
  const id = await createDeposito(db, asignacionId, { ...v, referencia: `tmp-${crypto.randomUUID()}` });
  await db.execute("UPDATE depositos SET referencia = ? WHERE id = ?", [v.referencia, id]);
  return id;
}
