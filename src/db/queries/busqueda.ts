import type { SqlDriver } from "../driver";
import type { EstadoCampana } from "../repos/campanas";
import { coincideBusqueda } from "@/domain/busqueda";
import { formatNumberVE, toUsd } from "@/domain/money";

export type CampanaEncontrada = { id: number; nombre: string; estado: EstadoCampana; fechaInicio: string };
export type GerenteEncontrado = {
  id: number;
  nombre: string;
  telefono: string | null;
  /** Campañas en las que está, de la más reciente a la más antigua. */
  asignaciones: { asignacionId: number; campanaNombre: string }[];
};
export type DepositoEncontrado = {
  id: number;
  fecha: string;
  banco: string;
  referencia: string;
  montoBs: string;
  usd: string;
  asignacionId: number;
  gerenteNombre: string;
  campanaId: number;
  campanaNombre: string;
};
export type ResultadoBusqueda = { campanas: CampanaEncontrada[]; gerentes: GerenteEncontrado[]; depositos: DepositoEncontrado[] };

const MAX = { campanas: 8, gerentes: 8, depositos: 20 };

/** Búsqueda en todas las campañas (lo más reciente primero). Se filtra en JS para ignorar acentos. */
export async function buscarGlobal(db: SqlDriver, texto: string): Promise<ResultadoBusqueda> {
  if (!texto.trim()) return { campanas: [], gerentes: [], depositos: [] };

  const campanas = (
    await db.select<CampanaEncontrada>(
      "SELECT id, nombre, estado, fecha_inicio AS fechaInicio FROM campanas ORDER BY fecha_inicio DESC, id DESC",
    )
  )
    .filter((c) => coincideBusqueda([c.nombre], [], texto))
    .slice(0, MAX.campanas);

  const filasGerentes = await db.select<{ id: number; nombre: string; telefono: string | null; asignacionId: number | null; campanaNombre: string | null }>(
    `SELECT g.id, g.nombre, g.telefono, a.id AS asignacionId, c.nombre AS campanaNombre
     FROM gerentes g
     LEFT JOIN asignaciones a ON a.gerente_id = g.id
     LEFT JOIN campanas c ON c.id = a.campana_id
     ORDER BY g.nombre COLLATE NOCASE, c.fecha_inicio DESC, c.id DESC`,
  );
  const porGerente = new Map<number, GerenteEncontrado>();
  for (const f of filasGerentes) {
    if (!coincideBusqueda([f.nombre, f.telefono ?? ""], [], texto)) continue;
    const g = porGerente.get(f.id) ?? { id: f.id, nombre: f.nombre, telefono: f.telefono, asignaciones: [] };
    if (f.asignacionId !== null && f.campanaNombre !== null) g.asignaciones.push({ asignacionId: f.asignacionId, campanaNombre: f.campanaNombre });
    porGerente.set(f.id, g);
  }

  const depositos: DepositoEncontrado[] = [];
  const filasDepositos = await db.select<Omit<DepositoEncontrado, "usd"> & { cuentaDestino: string; observaciones: string | null; tasaValor: string }>(
    `SELECT d.id, d.fecha, d.banco, d.referencia, d.monto_bs AS montoBs, d.cuenta_destino AS cuentaDestino, d.observaciones,
            t.valor AS tasaValor, a.id AS asignacionId, g.nombre AS gerenteNombre, c.id AS campanaId, c.nombre AS campanaNombre
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN gerentes g ON g.id = a.gerente_id
     JOIN campanas c ON c.id = a.campana_id
     JOIN tasas t ON t.id = d.tasa_id
     ORDER BY d.fecha DESC, d.creado_en DESC, d.id DESC`,
  );
  for (const { cuentaDestino, observaciones, tasaValor, ...d } of filasDepositos) {
    if (depositos.length >= MAX.depositos) break;
    const usd = toUsd(d.montoBs, tasaValor);
    if (coincideBusqueda([d.referencia, d.banco, cuentaDestino, observaciones ?? ""], [formatNumberVE(d.montoBs), formatNumberVE(usd)], texto)) {
      depositos.push({ ...d, usd });
    }
  }

  return { campanas, gerentes: [...porGerente.values()].slice(0, MAX.gerentes), depositos };
}
