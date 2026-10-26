import type { SqlDriver } from "../driver";
import { getGerente, type Gerente } from "../repos/gerentes";
import type { Etiqueta } from "../repos/etiquetas";
import type { EstadoCampana } from "../repos/campanas";
import type { AsignacionData, DepositoData } from "@/domain/campanaView";
import { DomainError } from "@/domain/errors";

export type CampanaDelGerente = { asignacionId: number; campanaId: number; campanaNombre: string; campanaEstado: EstadoCampana; fechaInicio: string };

export type GerenteData = { gerente: Gerente; etiquetas: Etiqueta[]; campanas: CampanaDelGerente[]; asignaciones: AsignacionData[]; depositos: DepositoData[] };

/** Todas las campañas de un gerente; `buildCampanaView(asignaciones, depositos)` da el resumen de cada una. */
export async function loadGerenteData(db: SqlDriver, gerenteId: number): Promise<GerenteData> {
  const gerente = await getGerente(db, gerenteId);
  if (!gerente) throw new DomainError("NO_ENCONTRADO", "El gerente no existe");
  const campanas = await db.select<CampanaDelGerente>(
    `SELECT a.id AS asignacionId, c.id AS campanaId, c.nombre AS campanaNombre, c.estado AS campanaEstado, c.fecha_inicio AS fechaInicio
     FROM asignaciones a JOIN campanas c ON c.id = a.campana_id
     WHERE a.gerente_id = ? ORDER BY c.fecha_inicio DESC, c.id DESC`,
    [gerenteId],
  );
  const asignaciones = await db.select<AsignacionData>(
    `SELECT a.id, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id
     WHERE a.gerente_id = ?`,
    [gerenteId],
  );
  const depositos = await db.select<DepositoData>(
    `SELECT d.id, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.tasa_id AS tasaId, t.valor AS tasaValor,
            d.observaciones, d.imagen_path AS imagenPath, t.imagen_path AS tasaImagenPath
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN tasas t ON t.id = d.tasa_id
     WHERE a.gerente_id = ?`,
    [gerenteId],
  );
  const etiquetas = await db.select<Etiqueta>(
    `SELECT e.id, e.nombre, e.color FROM gerente_etiquetas ge JOIN etiquetas e ON e.id = ge.etiqueta_id
     WHERE ge.gerente_id = ? ORDER BY e.nombre COLLATE NOCASE`,
    [gerenteId],
  );
  return { gerente, etiquetas, campanas, asignaciones, depositos };
}
