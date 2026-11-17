import Decimal from "decimal.js";
import { isValidIsoDate } from "./dates";
import { parseMonto } from "./money";
import type { Result } from "./validation";

/**
 * Meta general de la campaña para `fecha`: llegar a `montoUsd` pagado (toda la campaña) o a `porcentaje` del saldo asignado.
 * Exactamente uno de los dos va lleno. Las de porcentaje se miden también en cada gerente sobre su propio saldo.
 */
export type Meta = { id: number; campanaId: number; montoUsd: string | null; porcentaje: string | null; fecha: string; nota: string | null };

export type EstadoMeta = "cumplida" | "vencida" | "pendiente";

/**
 * `montoUsd`: el monto de la meta; en una de porcentaje, su equivalente sobre el asignado recibido (2 decimales).
 * `posicion`: dónde va su marca en la barra de avance (0–100, % del saldo; al final si lo pasa: `fueraDeEscala`).
 * `falta`: lo que queda por pagar para cumplirla (0.00 si se cumplió).
 */
export type MetaVista = Omit<Meta, "montoUsd"> & {
  montoUsd: string;
  posicion: number;
  estado: EstadoMeta;
  falta: string;
  fueraDeEscala: boolean;
  /** Meta de porcentaje sobre un saldo asignado de 0: no se puede cumplir ni decir cuánto falta. */
  sinSaldo: boolean;
};

/** Monto equivalente de un porcentaje del saldo (2 decimales). */
const equivalenteDe = (porcentaje: string, asignado: Decimal) => asignado.times(porcentaje).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Las metas en orden de fecha (y monto), medidas contra lo pagado de `total` (la campaña o un gerente). Se cumple al llegar
 * al monto (una de porcentaje, solo con saldo asignado); vence el día siguiente a su fecha si no se cumplió. `proxima` = la
 * primera sin cumplir (una vencida cuenta: aún falta lograrla).
 */
export function vistaMetas(metas: Meta[], total: { asignado: string; pagado: string }, hoy: string): { metas: MetaVista[]; proxima: MetaVista | null } {
  const asignado = new Decimal(total.asignado);
  const pagado = new Decimal(total.pagado);
  const vistas = metas
    .map((m): MetaVista => {
      const pct = m.porcentaje !== null;
      const monto = pct ? equivalenteDe(m.porcentaje!, asignado) : new Decimal(m.montoUsd!);
      const cumplida = pagado.gte(monto) && (!pct || asignado.gt(0));
      const fueraDeEscala = !pct && monto.gt(asignado);
      const posicion = pct
        ? Math.min(Number(m.porcentaje), 100)
        : asignado.gt(0) && !fueraDeEscala
          ? monto.div(asignado).times(100).toDecimalPlaces(2).toNumber()
          : 100;
      return {
        ...m,
        montoUsd: pct ? monto.toFixed(2) : m.montoUsd!,
        posicion,
        fueraDeEscala,
        sinSaldo: pct && asignado.lte(0),
        estado: cumplida ? "cumplida" : m.fecha < hoy ? "vencida" : "pendiente",
        falta: Decimal.max(monto.minus(pagado), 0).toFixed(2),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || new Decimal(a.montoUsd).cmp(b.montoUsd) || a.id - b.id);
  return { metas: vistas, proxima: vistas.find((m) => m.estado !== "cumplida") ?? null };
}

export const metasDePorcentaje = <T extends { porcentaje: string | null }>(ms: T[]): T[] => ms.filter((m) => m.porcentaje !== null);

/** Meta que se revisa por defecto en Por gerente: la primera de porcentaje sin cumplir (por fecha) o, si no, la última. */
export function metaPorDefecto(vistas: MetaVista[]): MetaVista | null {
  const pct = metasDePorcentaje(vistas);
  return pct.find((m) => m.estado !== "cumplida") ?? pct[pct.length - 1] ?? null;
}

export type CumplimientoGerente = { cumplida: boolean; equivalente: string; falta: string };

/** Si un gerente cumple una meta de porcentaje con lo pagado hasta hoy. Null si no es de porcentaje o no tiene saldo. */
export function cumplimientoGerente(m: Meta, g: { asignado: string; pagado: string }): CumplimientoGerente | null {
  const asignado = new Decimal(g.asignado);
  if (m.porcentaje === null || asignado.lte(0)) return null;
  const equivalente = equivalenteDe(m.porcentaje, asignado);
  const pagado = new Decimal(g.pagado);
  return { cumplida: pagado.gte(equivalente), equivalente: equivalente.toFixed(2), falta: Decimal.max(equivalente.minus(pagado), 0).toFixed(2) };
}

/** Cuántos gerentes cumplen y cuántos no (los sin saldo no cuentan). */
export function contarCumplimiento(m: Meta, gs: { asignado: string; pagado: string }[]): { cumplieron: number; noCumplieron: number } {
  let cumplieron = 0;
  let noCumplieron = 0;
  for (const g of gs) {
    const c = cumplimientoGerente(m, g);
    if (c) c.cumplida ? cumplieron++ : noCumplieron++;
  }
  return { cumplieron, noCumplieron };
}

export type MetaDraft = { tipo: "monto" | "porcentaje"; monto: string; porcentaje: string; fecha: string; nota: string };
export type MetaValida = { montoUsd: string | null; porcentaje: string | null; fecha: string; nota: string | null };

/** "60", "60,5" o "60.5" → texto decimal ("60.5"); fuera de (0, 100] o mal escrito → null. */
export function parsePorcentaje(texto: string): string | null {
  const t = texto.trim();
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return null;
  const d = new Decimal(t.replace(",", "."));
  return d.gt(0) && d.lte(100) ? d.toFixed() : null;
}

export function validateMeta(d: MetaDraft): Result<MetaValida, keyof MetaDraft> {
  const errors: Partial<Record<keyof MetaDraft, string>> = {};
  let montoUsd: string | null = null;
  let porcentaje: string | null = null;
  if (d.tipo === "porcentaje") {
    porcentaje = parsePorcentaje(d.porcentaje);
    if (porcentaje === null) errors.porcentaje = "Porcentaje inválido (de 0 a 100)";
  } else {
    const monto = parseMonto(d.monto);
    if (monto === null || !new Decimal(monto).gt(0)) errors.monto = "Monto inválido (debe ser mayor que 0)";
    else montoUsd = new Decimal(monto).toFixed();
  }
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { montoUsd, porcentaje, fecha: d.fecha, nota: d.nota.trim() || null } };
}

/** Días de `hoy` a `fecha` (negativo si ya pasó). */
export function diasHasta(hoy: string, fecha: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(fecha) - utc(hoy)) / 86_400_000);
}
