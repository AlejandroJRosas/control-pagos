import Decimal from "decimal.js";
import { numeroWhatsApp } from "./whatsapp";

export type CandidatoEnvio = { asignacionId: number; gerenteNombre: string; telefono: string | null; restante: string };

/** Gerentes que se marcan al abrir el envío en lote: los que aún deben y tienen un teléfono válido. */
export function seleccionInicial(c: CandidatoEnvio[]): Set<number> {
  return new Set(c.filter((x) => new Decimal(x.restante).gt(0) && numeroWhatsApp(x.telefono) !== null).map((x) => x.asignacionId));
}

/** Nombres de archivo de un lote sin repetir (Windows no distingue mayúsculas): al repetido le agrega " (2)", " (3)"… antes de la extensión. */
export function nombresSinRepetir(nombres: string[]): string[] {
  const vistos = new Map<string, number>();
  return nombres.map((n) => {
    const clave = n.toLowerCase();
    const veces = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, veces);
    if (veces === 1) return n;
    const punto = n.lastIndexOf(".");
    return punto > 0 ? `${n.slice(0, punto)} (${veces})${n.slice(punto)}` : `${n} (${veces})`;
  });
}
