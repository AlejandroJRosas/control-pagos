import type { SqlDriver } from "../driver";
import { createCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createTasa } from "../repos/tasas";
import type { DepositoGuardar } from "../repos/depositos";

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
