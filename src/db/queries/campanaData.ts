import type { SqlDriver } from "../driver";
import { getCampana, type Campana } from "../repos/campanas";
import type { AsignacionData, DepositoData } from "@/domain/campanaView";
import { DomainError } from "@/domain/errors";

export type CampanaData = { campana: Campana; asignaciones: (AsignacionData & { jefeId: number | null })[]; depositos: DepositoData[] };

export async function loadCampanaData(db: SqlDriver, campanaId: number): Promise<CampanaData> {
  const campana = await getCampana(db, campanaId);
  if (!campana) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
  const asignaciones = await db.select<AsignacionData & { jefeId: number | null }>(
    `SELECT a.id, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd, a.jefe_id AS jefeId
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id
     WHERE a.campana_id = ? ORDER BY g.nombre COLLATE NOCASE`,
    [campanaId],
  );
  const depositos = await db.select<DepositoData>(
    `SELECT d.id, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.tasa_id AS tasaId, t.valor AS tasaValor,
            d.observaciones, d.imagen_path AS imagenPath, t.imagen_path AS tasaImagenPath
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN tasas t ON t.id = d.tasa_id
     WHERE a.campana_id = ?`,
    [campanaId],
  );
  return { campana, asignaciones, depositos };
}
