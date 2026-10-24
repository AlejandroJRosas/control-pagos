import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { getAsignacion, jefesDeCampana, setJefeAsignacion } from "../repos/asignaciones";
import { DomainError } from "@/domain/errors";
import { cicloEn } from "@/domain/arbol";

/** Aplica los cambios uno a uno; si uno falla devuelve los ya hechos a su jefe anterior y relanza el error original. */
async function aplicar(db: SqlDriver, cambios: [number, number | null][], anteriores: Map<number, number | null>): Promise<void> {
  const hechos: number[] = [];
  try {
    for (const [id, jefe] of cambios) {
      await setJefeAsignacion(db, id, jefe);
      hechos.push(id);
    }
  } catch (e) {
    try {
      for (const id of hechos.reverse()) await setJefeAsignacion(db, id, anteriores.get(id) ?? null);
    } catch {
      /* se relanza el error original */
    }
    throw e;
  }
}

/**
 * Pone a varios gerentes de una campaña debajo del mismo jefe (o sin jefe). Todo o nada. Devuelve el jefe que tenía
 * cada uno, para deshacer con `restaurarJefes`.
 */
export async function moverAJefe(db: SqlDriver, ids: number[], jefeId: number | null): Promise<Map<number, number | null>> {
  if (ids.length === 0) throw new DomainError("VALIDACION", "Elige al menos un gerente");
  const asignaciones = await Promise.all(ids.map((id) => getAsignacion(db, id)));
  if (asignaciones.some((a) => !a)) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  const campanaId = asignaciones[0]!.campanaId;
  if (asignaciones.some((a) => a!.campanaId !== campanaId)) throw new DomainError("VALIDACION", "Los gerentes tienen que ser de la misma campaña");
  await assertCampanaActiva(db, campanaId);
  const actuales = await jefesDeCampana(db, campanaId);
  const finales = new Map(actuales);
  for (const id of ids) finales.set(id, jefeId);
  if (cicloEn(finales)) throw new DomainError("VALIDACION", "Un gerente no puede quedar debajo de sí mismo");
  const anteriores = new Map(ids.map((id) => [id, actuales.get(id) ?? null]));
  await aplicar(db, ids.map((id) => [id, jefeId]), anteriores);
  return anteriores;
}

/** Devuelve cada gerente a su jefe anterior (Deshacer de `moverAJefe`). Todo o nada. */
export async function restaurarJefes(db: SqlDriver, anteriores: Map<number, number | null>): Promise<void> {
  const ids = [...anteriores.keys()];
  if (ids.length === 0) return;
  const primero = await getAsignacion(db, ids[0]);
  if (!primero) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  const actuales = await jefesDeCampana(db, primero.campanaId);
  const previos = new Map(ids.map((id) => [id, actuales.get(id) ?? null]));
  await aplicar(db, [...anteriores], previos);
}
