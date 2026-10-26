import type { SqlDriver } from "../driver";
import type { AsignacionData, DepositoData } from "@/domain/campanaView";
import type { CampanaConDatos } from "@/domain/resumenGeneral";

/** Las campañas activas (más recientes primero) con sus datos, en tres consultas; `buildResumenGeneral` las resume. */
export async function loadResumenGeneral(db: SqlDriver): Promise<CampanaConDatos[]> {
  const campanas = await db.select<{ campanaId: number; campanaNombre: string; enCola: number }>(
    `SELECT c.id AS campanaId, c.nombre AS campanaNombre,
            (SELECT COUNT(*) FROM cola_depositos q WHERE q.campana_id = c.id AND q.estado = 'pendiente') AS enCola
     FROM campanas c WHERE c.estado = 'activa' ORDER BY c.fecha_inicio DESC, c.id DESC`,
  );
  const asignaciones = await db.select<AsignacionData & { campanaId: number }>(
    `SELECT a.id, a.campana_id AS campanaId, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id JOIN campanas c ON c.id = a.campana_id
     WHERE c.estado = 'activa' ORDER BY g.nombre COLLATE NOCASE`,
  );
  const depositos = await db.select<DepositoData & { campanaId: number }>(
    `SELECT d.id, a.campana_id AS campanaId, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.tasa_id AS tasaId, t.valor AS tasaValor,
            d.observaciones, d.imagen_path AS imagenPath, t.imagen_path AS tasaImagenPath
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN campanas c ON c.id = a.campana_id
     JOIN tasas t ON t.id = d.tasa_id
     WHERE c.estado = 'activa'`,
  );
  return campanas.map((c) => ({
    ...c,
    asignaciones: asignaciones.filter((a) => a.campanaId === c.campanaId),
    depositos: depositos.filter((d) => d.campanaId === c.campanaId),
  }));
}
