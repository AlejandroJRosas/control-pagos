import Decimal from "decimal.js";
import { buildCampanaView, calcResumen, type AsignacionData, type DepositoData, type Resumen } from "./campanaView";
import { sumarDias } from "./dates";

/** `enCola`: comprobantes pendientes de revisión (no cuentan en los saldos). */
export type CampanaConDatos = { campanaId: number; campanaNombre: string; enCola: number; asignaciones: AsignacionData[]; depositos: DepositoData[] };

export type FilaCampana = Resumen & { campanaId: number; campanaNombre: string; gerentes: number; semanaUsd: string; semanaCantidad: number; enCola: number };

/** `debe`: suma de lo que le falta en cada campaña; lo pagado de más en una no descuenta otra. */
export type DeudaGerente = { gerenteId: number; gerenteNombre: string; debe: string; campanas: number };

export type ResumenGeneral = {
  total: Resumen;
  semana: { desde: string; usd: string; cantidad: number };
  campanas: FilaCampana[];
  deudores: DeudaGerente[];
};

/** Resumen de varias campañas; "semana" son los últimos 7 días contando hoy. */
export function buildResumenGeneral(campanas: CampanaConDatos[], hoy: string): ResumenGeneral {
  const desde = sumarDias(hoy, -6);
  const enSemana = (fecha: string) => fecha >= desde && fecha <= hoy;
  let asignado = new Decimal(0);
  const usds: string[] = [];
  const fechas: string[] = [];
  const semana: string[] = [];
  const deudas = new Map<number, { gerenteNombre: string; debe: Decimal; campanas: number }>();

  const filas = campanas.map((c): FilaCampana => {
    const view = buildCampanaView(c.asignaciones, c.depositos);
    asignado = asignado.plus(view.total.asignado);
    const deSemana = view.depositos.filter((d) => enSemana(d.fecha)).map((d) => d.usd);
    for (const d of view.depositos) {
      usds.push(d.usd);
      fechas.push(d.fecha);
    }
    semana.push(...deSemana);
    for (const g of view.gerentes) {
      const falta = new Decimal(g.restante);
      if (falta.lte(0)) continue;
      const actual = deudas.get(g.gerenteId) ?? { gerenteNombre: g.gerenteNombre, debe: new Decimal(0), campanas: 0 };
      deudas.set(g.gerenteId, { ...actual, debe: actual.debe.plus(falta), campanas: actual.campanas + 1 });
    }
    return {
      ...view.total,
      campanaId: c.campanaId,
      campanaNombre: c.campanaNombre,
      gerentes: c.asignaciones.length,
      semanaUsd: sumar(deSemana),
      semanaCantidad: deSemana.length,
      enCola: c.enCola,
    };
  });

  const deudores = [...deudas.entries()]
    .map(([gerenteId, d]) => ({ gerenteId, gerenteNombre: d.gerenteNombre, debe: d.debe.toFixed(2), campanas: d.campanas }))
    .sort((a, b) => new Decimal(b.debe).cmp(a.debe) || a.gerenteNombre.localeCompare(b.gerenteNombre, "es"));

  return {
    total: calcResumen(asignado, usds, fechas),
    semana: { desde, usd: sumar(semana), cantidad: semana.length },
    campanas: filas,
    deudores,
  };
}

const sumar = (usds: string[]) => usds.reduce((acc, u) => acc.plus(u), new Decimal(0)).toFixed(2);
