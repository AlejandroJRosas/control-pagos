import type { SqlDriver } from "../driver";
import { gruposDuplicados } from "@/domain/duplicados";

export type DepositoDuplicado = {
  id: number;
  asignacionId: number;
  fecha: string;
  creadoEn: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaValor: string;
  observaciones: string | null;
  imagenPath: string | null;
  gerenteNombre: string;
  campanaId: number;
  campanaNombre: string;
  campanaEstado: "activa" | "cerrada";
};

/** Grupos de depósitos duplicados (mismo banco y referencia) con al menos uno en la campaña; pueden incluir los de otras. */
export async function loadDuplicadosCampana(db: SqlDriver, campanaId: number): Promise<DepositoDuplicado[][]> {
  const rows = await db.select<DepositoDuplicado>(
    `SELECT d.id, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, t.valor AS tasaValor, d.observaciones,
            d.imagen_path AS imagenPath, g.nombre AS gerenteNombre, c.id AS campanaId, c.nombre AS campanaNombre,
            c.estado AS campanaEstado
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN gerentes g ON g.id = a.gerente_id
     JOIN campanas c ON c.id = a.campana_id
     JOIN tasas t ON t.id = d.tasa_id`,
  );
  return gruposDuplicados(rows).filter((g) => g.some((d) => d.campanaId === campanaId));
}
