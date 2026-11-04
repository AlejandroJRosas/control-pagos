import type { SqlDriver } from "../driver";
import { listCampanas, type Campana } from "../repos/campanas";
import { buildCampanaView, type AsignacionData, type DepositoData, type Resumen } from "@/domain/campanaView";

export type TotalCampana = { campana: Campana; total: Resumen; gerentes: number };

/**
 * El total de cada campaña (lista de Campañas) en tres consultas, no tres por campaña: se traen todas las asignaciones y
 * depósitos de una vez y se resumen con `buildCampanaView`, así los montos son los mismos que dentro de la campaña.
 */
export async function loadTotalesCampanas(db: SqlDriver): Promise<TotalCampana[]> {
  const campanas = await listCampanas(db);
  const asignaciones = await db.select<AsignacionData & { campanaId: number }>(
    `SELECT a.id, a.campana_id AS campanaId, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id`,
  );
  const depositos = await db.select<DepositoData & { campanaId: number }>(
    `SELECT d.id, a.campana_id AS campanaId, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.tasa_id AS tasaId, t.valor AS tasaValor,
            d.observaciones, d.imagen_path AS imagenPath, t.imagen_path AS tasaImagenPath
     FROM depositos d JOIN asignaciones a ON a.id = d.asignacion_id JOIN tasas t ON t.id = d.tasa_id`,
  );
  const agrupar = <T extends { campanaId: number }>(filas: T[]) => {
    const por = new Map<number, T[]>();
    for (const f of filas) {
      const lista = por.get(f.campanaId);
      if (lista) lista.push(f);
      else por.set(f.campanaId, [f]);
    }
    return por;
  };
  const asigPor = agrupar(asignaciones);
  const depPor = agrupar(depositos);
  return campanas.map((campana) => {
    const asigs = asigPor.get(campana.id) ?? [];
    return { campana, total: buildCampanaView(asigs, depPor.get(campana.id) ?? []).total, gerentes: asigs.length };
  });
}
