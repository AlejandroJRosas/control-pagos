import Decimal from "decimal.js";
import { buildCampanaView, type AsignacionData, type DepositoData, type GerenteResumen } from "./campanaView";
import type { Decisiones, PlanConsolidacion } from "./consolidar";

type TasasLocales = ReadonlyMap<string, { id: number; valor: string }>;

/** Valor de la tasa de una fecha después de consolidar: la del archivo si se eligió o si se crea; si no, la mía. */
export function tasaParaFecha(plan: PlanConsolidacion, d: Decisiones, tasas: TasasLocales, fecha: string): string | null {
  const distinta = plan.tasasDistintas.find((t) => t.fecha === fecha);
  if (distinta && d.tasas[fecha] === "archivo") return distinta.archivo;
  return tasas.get(fecha)?.valor ?? plan.tasasNuevas.find((t) => t.fecha === fecha)?.valor ?? null;
}

/** `agregado`: el gerente entra a la campaña al consolidar. */
export type CambioGerente = { asignacionId: number; gerenteNombre: string; antes: GerenteResumen; despues: GerenteResumen; agregado: boolean };

/**
 * Cómo queda cada gerente de la campaña si se consolida con estas decisiones (gerentes agregados, nuevos, correcciones, conflictos del
 * archivo, eliminaciones marcadas, tasas y montos asignados elegidos). Solo los gerentes que cambian (los agregados, siempre).
 */
export function resumenConsolidacion(
  base: { asignaciones: AsignacionData[]; depositos: DepositoData[] },
  plan: PlanConsolidacion,
  d: Decisiones,
  tasas: TasasLocales,
): CambioGerente[] {
  const fechaDeTasaId = new Map([...tasas].map(([fecha, t]) => [t.id, fecha]));
  const valor = (fecha: string, actual: string) => tasaParaFecha(plan, d, tasas, fecha) ?? actual;

  const eliminados = new Set(plan.eliminaciones.filter((e) => d.eliminar.has(e.remotoUuid)).map((e) => e.local.id));
  const reemplazos = new Map(
    [...plan.correcciones, ...plan.conflictos.filter((c) => d.conflictos[c.remoto.uuid] === "archivo")].map((c) => [c.local.id, c] as const),
  );
  const depositos: DepositoData[] = base.depositos.flatMap((x) => {
    if (eliminados.has(x.id)) return [];
    const fechaTasa = fechaDeTasaId.get(x.tasaId);
    const tasaActual = fechaTasa ? valor(fechaTasa, x.tasaValor) : x.tasaValor;
    const c = reemplazos.get(x.id);
    if (!c) return [{ ...x, tasaValor: tasaActual }];
    return [{ ...x, asignacionId: c.asignacionId, fecha: c.remoto.fecha, montoBs: c.remoto.montoBs, tasaValor: valor(c.tasa.fecha, tasaActual) }];
  });
  plan.nuevos.forEach((n, i) => {
    const tasaValor = tasaParaFecha(plan, d, tasas, n.tasa.fecha);
    if (tasaValor === null) return;
    depositos.push({
      id: -(i + 1), asignacionId: n.asignacionId, fecha: n.remoto.fecha, creadoEn: n.remoto.creadoEn, banco: n.remoto.banco, referencia: n.remoto.referencia,
      cuentaDestino: n.remoto.cuentaDestino, montoBs: n.remoto.montoBs, tasaId: 0, tasaValor, observaciones: n.remoto.observaciones, imagenPath: null,
    });
  });
  // Las agregadas: antes en cero y sin depósitos; después con el monto del archivo (con su id provisional, como sus nuevos).
  const agregadas = new Set(plan.agregadas.map((a) => a.asignacionId));
  const agregada = (a: PlanConsolidacion["agregadas"][number], saldoUsd: string): AsignacionData => ({
    id: a.asignacionId, gerenteId: a.gerenteId ?? a.asignacionId, gerenteNombre: a.gerenteNombre, saldoUsd,
  });
  const asignaciones = [
    ...base.asignaciones.map((a) => {
      const s = plan.saldos.find((x) => x.asignacionId === a.id);
      return s && d.saldos[a.id] === "archivo" ? { ...a, saldoUsd: s.archivo } : a;
    }),
    ...plan.agregadas.map((a) => agregada(a, a.saldoUsd)),
  ];

  const antes = buildCampanaView([...base.asignaciones, ...plan.agregadas.map((a) => agregada(a, "0"))], base.depositos).gerentes;
  const despues = buildCampanaView(asignaciones, depositos).gerentes;
  return antes.flatMap((a, i) => {
    const b = despues[i];
    const agregado = agregadas.has(a.asignacionId);
    const igual = new Decimal(a.pagado).eq(b.pagado) && new Decimal(a.asignado).eq(b.asignado) && a.cantidad === b.cantidad;
    return igual && !agregado ? [] : [{ asignacionId: a.asignacionId, gerenteNombre: a.gerenteNombre, antes: a, despues: b, agregado }];
  });
}

/** "Consolidado: 12 nuevos, 2 corregidos, 1 eliminado" (solo lo distinto de cero). */
export function mensajeConsolidado(r: { nuevos: number; corregidos: number; eliminados: number }): string {
  const parte = (n: number, palabra: string) => (n === 0 ? [] : [`${n} ${palabra}${n === 1 ? "" : "s"}`]);
  const partes = [...parte(r.nuevos, "nuevo"), ...parte(r.corregidos, "corregido"), ...parte(r.eliminados, "eliminado")];
  return partes.length === 0 ? "Consolidado" : `Consolidado: ${partes.join(", ")}`;
}
