import type { BorradorDeposito, BorradorTasa } from "@/db/repos/cola";
import { aplicarExtraccion, reemplazarConExtraccion } from "@/extraction/autollenado";
import type { CampoPropuesto, CamposDeposito, CamposTasa } from "@/extraction/extractor";

const CAMPOS_DEPOSITO: CamposDeposito[] = ["fecha", "banco", "referencia", "cuentaDestino", "montoBs"];
const vacios = <F extends string>(campos: F[]) => Object.fromEntries(campos.map((k) => [k, ""])) as Record<F, string>;

/** Aplica lo leído del comprobante al borrador de la cola; lo que no se leyó queda vacío (también la fecha). */
export function borradorDepositoConOcr(b: BorradorDeposito, fields: Partial<Record<CamposDeposito, CampoPropuesto>>): BorradorDeposito {
  const actuales = Object.fromEntries(CAMPOS_DEPOSITO.map((k) => [k, b.draft[k]])) as Record<CamposDeposito, string>;
  const r = aplicarExtraccion(actuales, b.auto, fields, vacios(CAMPOS_DEPOSITO));
  return { ...b, draft: { ...b.draft, ...r.valores }, auto: r.auto };
}

export function borradorTasaConOcr(b: BorradorTasa, fields: Partial<Record<CamposTasa, CampoPropuesto>>): BorradorTasa {
  const r = aplicarExtraccion({ fecha: b.draft.fecha, valor: b.draft.valor }, b.auto, fields, vacios<CamposTasa>(["fecha", "valor"]));
  return { ...b, draft: { ...b.draft, ...r.valores }, auto: r.auto };
}

/** "Volver a leer": lo leído reemplaza lo del borrador (también lo escrito a mano); lo demás queda. */
export function releerBorradorDeposito(b: BorradorDeposito, fields: Partial<Record<CamposDeposito, CampoPropuesto>>) {
  const actuales = Object.fromEntries(CAMPOS_DEPOSITO.map((k) => [k, b.draft[k]])) as Record<CamposDeposito, string>;
  const r = reemplazarConExtraccion(actuales, b.auto, fields);
  return { borrador: { ...b, draft: { ...b.draft, ...r.valores }, auto: r.auto }, cambiados: r.cambiados };
}

export function releerBorradorTasa(b: BorradorTasa, fields: Partial<Record<CamposTasa, CampoPropuesto>>) {
  const r = reemplazarConExtraccion({ fecha: b.draft.fecha, valor: b.draft.valor }, b.auto, fields);
  return { borrador: { ...b, draft: { ...b.draft, ...r.valores }, auto: r.auto }, cambiados: r.cambiados };
}
