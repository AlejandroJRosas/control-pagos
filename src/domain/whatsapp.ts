import Decimal from "decimal.js";
import { formatFecha } from "./dates";
import { formatUsd } from "./money";

/**
 * Número para wa.me (solo dígitos, con código de país). Los números venezolanos se aceptan como se escriben
 * aquí ("0414-1234567", "414 1234567"); los de otros países, con "+". Devuelve null si no parece un teléfono.
 */
export function numeroWhatsApp(telefono: string | null): string | null {
  if (!telefono) return null;
  const internacional = telefono.trim().startsWith("+");
  const d = telefono.replace(/\D/g, "");
  if (internacional) return d.length >= 8 && d.length <= 15 ? d : null;
  if (/^58\d{10}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return `58${d.slice(1)}`;
  if (/^[24]\d{9}$/.test(d)) return `58${d}`;
  return null;
}

export const urlWhatsApp = (numero: string, texto: string): string => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

export type EstadoCuenta = {
  gerenteNombre: string;
  campanaNombre: string;
  fechaCorte: string;
  asignado: string;
  pagado: string;
  restante: string;
  cantidad: number;
};

/** Mensajes editables: uno para quien aún debe y otro para quien completó o pagó de más. */
export type Plantillas = { pendiente: string; completo: string };

export const CAMPOS_PLANTILLA = ["gerente", "campana", "fecha", "asignado", "pagado", "restante", "saldo", "depositos"] as const;
export type CampoPlantilla = (typeof CAMPOS_PLANTILLA)[number];

const encabezado = "Hola {gerente}, este es tu estado de cuenta de la campaña {campana} al {fecha}:";
const cuerpo = (saldo: string) =>
  [encabezado, "", "• Asignado: {asignado}", "• Pagado: {pagado} ({depositos})", saldo, "", "Cualquier diferencia, avísame por aquí. ¡Gracias!"].join("\n");

export const PLANTILLAS_POR_DEFECTO: Plantillas = { pendiente: cuerpo("• Restante: {restante}"), completo: cuerpo("• {saldo}") };

function valores(e: EstadoCuenta): Record<CampoPlantilla, string> {
  const restante = new Decimal(e.restante);
  const saldo = restante.isNegative() && !restante.isZero()
    ? `Pagado de más: ${formatUsd(restante.abs())}`
    : restante.isZero()
      ? "Saldo completo"
      : `Restante: ${formatUsd(restante)}`;
  return {
    gerente: e.gerenteNombre,
    campana: e.campanaNombre,
    fecha: formatFecha(e.fechaCorte),
    asignado: formatUsd(e.asignado),
    pagado: formatUsd(e.pagado),
    restante: formatUsd(restante.abs()),
    saldo,
    depositos: `${e.cantidad} ${e.cantidad === 1 ? "depósito" : "depósitos"}`,
  };
}

const CAMPO = /\{([^{}\s]+)\}/g;
const esCampo = (k: string): k is CampoPlantilla => (CAMPOS_PLANTILLA as readonly string[]).includes(k);

/** Reemplaza `{campo}` por su valor; un campo desconocido se deja tal cual. */
export function aplicarPlantilla(plantilla: string, e: EstadoCuenta): string {
  const v = valores(e);
  return plantilla.replace(CAMPO, (todo, k: string) => (esCampo(k) ? v[k] : todo));
}

/** Campos escritos en la plantilla que no existen (para avisar en la vista previa). */
export function camposDesconocidos(plantilla: string): string[] {
  return [...new Set([...plantilla.matchAll(CAMPO)].map((m) => m[1]).filter((k) => !esCampo(k)))];
}

export function mensajeEstadoCuenta(e: EstadoCuenta, p: Plantillas = PLANTILLAS_POR_DEFECTO): string {
  return aplicarPlantilla(new Decimal(e.restante).gt(0) ? p.pendiente : p.completo, e);
}
