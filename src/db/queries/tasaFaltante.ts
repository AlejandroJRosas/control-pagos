import type { SqlDriver } from "../driver";
import { feriadosSet } from "../repos/feriados";
import { tasasFaltantes, type TasasFaltantes } from "@/domain/tasaFaltante";

/** Tasas que faltan hoy y las que necesitan los depósitos pendientes de revisión. */
export async function getTasasFaltantes(db: SqlDriver, hoy: string): Promise<TasasFaltantes> {
  const tasas = await db.select<{ fecha: string }>("SELECT fecha FROM tasas");
  const cola = await db.select<{ borrador: string }>("SELECT borrador FROM cola_depositos WHERE estado = 'pendiente'");
  const fechas = cola.map((c) => {
    try {
      return String((JSON.parse(c.borrador) as { draft?: { fecha?: unknown } }).draft?.fecha ?? "");
    } catch {
      return "";
    }
  });
  return tasasFaltantes(hoy, new Set(tasas.map((t) => t.fecha)), await feriadosSet(db), fechas);
}
