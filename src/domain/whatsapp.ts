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

type Estado = {
  gerenteNombre: string;
  campanaNombre: string;
  fechaCorte: string;
  asignado: string;
  pagado: string;
  restante: string;
  cantidad: number;
};

export function mensajeEstadoCuenta(e: Estado): string {
  const restante = new Decimal(e.restante);
  const saldo = restante.isNegative() && !restante.isZero()
    ? `• Pagado de más: ${formatUsd(restante.abs())}`
    : restante.isZero()
      ? "• Saldo completo"
      : `• Restante: ${formatUsd(restante)}`;
  return [
    `Hola ${e.gerenteNombre}, este es tu estado de cuenta de la campaña ${e.campanaNombre} al ${formatFecha(e.fechaCorte)}:`,
    "",
    `• Asignado: ${formatUsd(e.asignado)}`,
    `• Pagado: ${formatUsd(e.pagado)} (${e.cantidad} ${e.cantidad === 1 ? "depósito" : "depósitos"})`,
    saldo,
    "",
    "Cualquier diferencia, avísame por aquí. ¡Gracias!",
  ].join("\n");
}
