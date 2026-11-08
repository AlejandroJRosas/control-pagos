import type { SqlDriver } from "../driver";
import { fechaDeTasa } from "@/domain/dates";
import { feriadosSet } from "../repos/feriados";

/**
 * Pone a cada depósito la tasa que rige su fecha (`fechaDeTasa`). Arregla los registrados con la regla vieja (fin de
 * semana = tasa del viernes): la de ahora es la del siguiente día hábil. Si falta esa tasa lo deja como está; no toca
 * campañas cerradas ni `actualizado_en` (la tasa sale de la fecha, no es una edición). Idempotente; devuelve cuántos cambió.
 */
export async function corregirTasasDepositos(db: SqlDriver): Promise<number> {
  const feriados = await feriadosSet(db);
  const tasas = new Map((await db.select<{ id: number; fecha: string }>("SELECT id, fecha FROM tasas")).map((t) => [t.fecha, t.id]));
  const deps = await db.select<{ id: number; fecha: string; tasaFecha: string }>(
    `SELECT d.id, d.fecha, t.fecha AS tasaFecha
     FROM depositos d JOIN tasas t ON t.id = d.tasa_id JOIN asignaciones a ON a.id = d.asignacion_id JOIN campanas c ON c.id = a.campana_id
     WHERE c.estado = 'activa' AND d.fecha <> t.fecha`,
  );
  let cambiados = 0;
  for (const d of deps) {
    const rige = fechaDeTasa(d.fecha, feriados);
    const tasaId = tasas.get(rige);
    if (rige === d.tasaFecha || tasaId === undefined) continue;
    await db.execute("UPDATE depositos SET tasa_id = ? WHERE id = ?", [tasaId, d.id]);
    cambiados++;
  }
  return cambiados;
}
