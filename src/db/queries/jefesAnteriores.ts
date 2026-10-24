import type { SqlDriver } from "../driver";

/**
 * Para cada gerente, el gerente que era su jefe en la campaña más reciente donde estuvo (sin contar `campanaId`;
 * "más reciente" = `fecha_inicio DESC, id DESC`, como `listCampanas`). No incluye a quien no tenía jefe allí.
 */
export async function jefesAnteriores(db: SqlDriver, campanaId: number, gerenteIds: number[]): Promise<Map<number, number>> {
  if (gerenteIds.length === 0) return new Map();
  const marcas = gerenteIds.map(() => "?").join(", ");
  const rows = await db.select<{ gerenteId: number; jefeGerenteId: number | null }>(
    `SELECT t.gerente_id AS gerenteId, j.gerente_id AS jefeGerenteId
     FROM (
       SELECT a.gerente_id, a.jefe_id,
              ROW_NUMBER() OVER (PARTITION BY a.gerente_id ORDER BY c.fecha_inicio DESC, c.id DESC) AS n
       FROM asignaciones a JOIN campanas c ON c.id = a.campana_id
       WHERE a.campana_id <> ? AND a.gerente_id IN (${marcas})
     ) t
     LEFT JOIN asignaciones j ON j.id = t.jefe_id
     WHERE t.n = 1`,
    [campanaId, ...gerenteIds],
  );
  const salida = new Map<number, number>();
  for (const r of rows) if (r.jefeGerenteId !== null) salida.set(r.gerenteId, r.jefeGerenteId);
  return salida;
}
