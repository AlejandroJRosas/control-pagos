import type { SqlDriver } from "../driver";
import type { DatosEnvio } from "../../domain/paquete";
import { getIntercambios, listEliminaciones } from "../repos/consolidacion";

/** Todo lo de una campaña que puede ir en un paquete de consolidación (sin filtrar por selección). */
export async function cargarEnvio(db: SqlDriver, campanaId: number): Promise<DatosEnvio> {
  const [campana] = await db.select<{ id: number; uuid: string; nombre: string }>("SELECT id, uuid, nombre FROM campanas WHERE id = ?", [campanaId]);
  const asignaciones = await db.select<Omit<DatosEnvio["asignaciones"][number], "ultimoEnvio">>(
    `SELECT a.id, a.uuid, a.gerente_id AS gerenteId, g.uuid AS gerenteUuid, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE a.campana_id = ? ORDER BY g.nombre, a.id`,
    [campanaId],
  );
  const depositos = await db.select<DatosEnvio["depositos"][number]>(
    `SELECT d.uuid, a.uuid AS asignacionUuid, d.asignacion_id AS asignacionId, d.fecha, d.banco, d.referencia, d.cuenta_destino AS cuentaDestino,
            d.monto_bs AS montoBs, d.observaciones, t.fecha AS tasaFecha, t.valor AS tasaValor, d.creado_en AS creadoEn,
            d.actualizado_en AS actualizadoEn, d.imagen_path AS imagenPath
     FROM depositos d JOIN asignaciones a ON a.id = d.asignacion_id JOIN tasas t ON t.id = d.tasa_id
     WHERE a.campana_id = ? ORDER BY d.fecha, d.creado_en, d.id`,
    [campanaId],
  );
  const intercambios = await getIntercambios(db, campanaId);
  return {
    campana,
    asignaciones: asignaciones.map((a) => ({ ...a, ultimoEnvio: intercambios.get(a.id)?.envio ?? null })),
    depositos,
    eliminaciones: await listEliminaciones(db, campana.uuid),
  };
}
