import Decimal from "decimal.js";
import { isValidIsoDate } from "./dates";
import { parseMonto } from "./money";
import type { Result } from "./validation";

/** Meta general de la campaña: llegar a `montoUsd` pagado (toda la campaña) para `fecha`. */
export type Meta = { id: number; campanaId: number; montoUsd: string; fecha: string; nota: string | null };

export type EstadoMeta = "cumplida" | "vencida" | "pendiente";

/**
 * `posicion`: dónde va su marca en la barra de avance (0–100, % del saldo general; al final si lo pasa: `fueraDeEscala`).
 * `falta`: lo que queda por pagar para cumplirla (0.00 si se cumplió).
 */
export type MetaVista = Meta & { posicion: number; estado: EstadoMeta; falta: string; fueraDeEscala: boolean };

/**
 * Las metas en orden de fecha (y monto), medidas contra lo pagado de la campaña. Se cumple al llegar al monto; vence el
 * día siguiente a su fecha si no se cumplió. `proxima` = la primera sin cumplir (una vencida cuenta: aún falta lograrla).
 */
export function vistaMetas(metas: Meta[], total: { asignado: string; pagado: string }, hoy: string): { metas: MetaVista[]; proxima: MetaVista | null } {
  const asignado = new Decimal(total.asignado);
  const pagado = new Decimal(total.pagado);
  const vistas = [...metas]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || new Decimal(a.montoUsd).cmp(b.montoUsd) || a.id - b.id)
    .map((m): MetaVista => {
      const monto = new Decimal(m.montoUsd);
      const cumplida = pagado.gte(monto);
      const fueraDeEscala = monto.gt(asignado);
      const posicion = asignado.gt(0) && !fueraDeEscala ? monto.div(asignado).times(100).toDecimalPlaces(2).toNumber() : 100;
      return {
        ...m,
        posicion,
        fueraDeEscala,
        estado: cumplida ? "cumplida" : m.fecha < hoy ? "vencida" : "pendiente",
        falta: Decimal.max(monto.minus(pagado), 0).toFixed(2),
      };
    });
  return { metas: vistas, proxima: vistas.find((m) => m.estado !== "cumplida") ?? null };
}

export type MetaDraft = { monto: string; fecha: string; nota: string };
export type MetaValida = { montoUsd: string; fecha: string; nota: string | null };

export function validateMeta(d: MetaDraft): Result<MetaValida, keyof MetaDraft> {
  const errors: Partial<Record<keyof MetaDraft, string>> = {};
  const monto = parseMonto(d.monto);
  if (monto === null || !new Decimal(monto).gt(0)) errors.monto = "Monto inválido (debe ser mayor que 0)";
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { montoUsd: new Decimal(monto!).toFixed(), fecha: d.fecha, nota: d.nota.trim() || null } };
}

/** Días de `hoy` a `fecha` (negativo si ya pasó). */
export function diasHasta(hoy: string, fecha: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(fecha) - utc(hoy)) / 86_400_000);
}
