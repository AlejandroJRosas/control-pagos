import type { SqlDriver } from "../driver";
import { getAjuste } from "../repos/ajustes";
import { listGerentes } from "../repos/gerentes";
import { AJUSTE_ANTELACION_CUMPLE, antelacionDeAjuste, cumpleanosProximos, type CumpleProximo } from "@/domain/cumpleanos";

/** Cumpleaños de gerentes activos de hoy a los días de antelación configurados. */
export async function getCumpleanosProximos(db: SqlDriver, hoy: string): Promise<{ antelacion: number; proximos: CumpleProximo[] }> {
  const antelacion = antelacionDeAjuste(await getAjuste(db, AJUSTE_ANTELACION_CUMPLE));
  return { antelacion, proximos: cumpleanosProximos(await listGerentes(db, { soloActivos: true }), hoy, antelacion) };
}
