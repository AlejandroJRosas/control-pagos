import Decimal from "decimal.js";
import { estadoGerente, type Resumen } from "@/domain/campanaView";
import { formatUsd } from "@/domain/money";

/** Colores comunes del PDF y del Excel (hex sin "#"). */
export const COLOR = {
  azul: "1f3a5f",
  banda: "f5f8fc",
  total: "eef2f7",
  grisBarra: "e8e8e8",
  linea: "e5e7eb",
  gris: "6b6b6b",
  barraAzul: "2563eb",
  verde: "059669",
  ambar: "d97706",
  rojo: "dc2626",
  textoVerde: "047857",
  textoAmbar: "b45309",
  textoRojo: "b91c1c",
} as const;

export const hex = (c: string) => `#${c}`;
export const argb = (c: string) => `FF${c.toUpperCase()}`;

export function colorBarra(r: Resumen): string {
  const estado = estadoGerente(r);
  if (estado === "excedido") return COLOR.rojo;
  if (estado === "completo") return COLOR.verde;
  return r.pct < 50 ? COLOR.ambar : COLOR.barraAzul;
}

export const anchoBarra = (r: Resumen): number => Math.min(Math.max(r.ratio, 0), 1);

export function textoRestante(r: Resumen): { etiqueta: "Faltan" | "Pagado de más"; monto: string; excedido: boolean } {
  const restante = new Decimal(r.restante);
  const excedido = restante.isNegative() && !restante.isZero();
  return { etiqueta: excedido ? "Pagado de más" : "Faltan", monto: formatUsd(restante.abs()), excedido };
}
