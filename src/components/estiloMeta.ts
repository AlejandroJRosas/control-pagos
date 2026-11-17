import { CircleAlert, CircleCheck, Flag, type LucideIcon } from "lucide-react";
import { formatFecha } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import type { EstadoMeta, MetaVista } from "@/domain/metas";

/** Color e ícono de cada estado de meta (la marca en la barra y su etiqueta). */
export const ESTILO_META: Record<EstadoMeta, { icono: LucideIcon; texto: string; linea: string }> = {
  cumplida: { icono: CircleCheck, texto: "text-emerald-700 dark:text-emerald-400", linea: "bg-emerald-600" },
  vencida: { icono: CircleAlert, texto: "text-destructive", linea: "bg-destructive" },
  pendiente: { icono: Flag, texto: "text-foreground", linea: "bg-foreground/70" },
};

/** El objetivo de la meta: "$ 30.000,00", o con su monto equivalente si es de porcentaje: "60,0 % ($ 30.000,00)". */
export function textoMeta(m: MetaVista): string {
  return m.porcentaje !== null ? `${formatPct(Number(m.porcentaje))} (${formatUsd(m.montoUsd)})` : formatUsd(m.montoUsd);
}

/** "Meta $ 80,00 para el 20/03/2026 · vencida · faltan $ 30,00" (nombre de la marca y aviso al pasar el mouse). */
export function describirMeta(m: MetaVista): string {
  const estado =
    m.estado === "cumplida" ? "cumplida" : `${m.estado === "vencida" ? "vencida · " : ""}${m.sinSaldo ? "sin saldo asignado" : `faltan ${formatUsd(m.falta)}`}`;
  return `Meta ${textoMeta(m)} para el ${formatFecha(m.fecha)} · ${estado}${m.fueraDeEscala ? " · supera el saldo general" : ""}${m.nota ? ` · ${m.nota}` : ""}`;
}
