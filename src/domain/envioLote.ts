import Decimal from "decimal.js";
import { numeroWhatsApp } from "./whatsapp";

export type CandidatoEnvio = { asignacionId: number; gerenteNombre: string; telefono: string | null; restante: string };

/** Gerentes que se marcan al abrir el envío en lote: los que aún deben y tienen un teléfono válido. */
export function seleccionInicial(c: CandidatoEnvio[]): Set<number> {
  return new Set(c.filter((x) => new Decimal(x.restante).gt(0) && numeroWhatsApp(x.telefono) !== null).map((x) => x.asignacionId));
}
