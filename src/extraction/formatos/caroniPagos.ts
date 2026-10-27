import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { celular, crudo, digitos, fechaDma, montoBs } from "./comun";

/**
 * Banco Caroní, "Caroní Pagos" (pago móvil): filas etiqueta/valor con " : " (Monto BS., Banco Destino Fondos,
 * Cuenta / Tarjeta Destino / Tlf "0172. 4141234567", Fecha y Hora de Operación "16-10-2026. 11:57:10 AM",
 * Número de Referencia). La fecha de arriba va en formato de EE. UU. (mm/dd/aa) y no se usa.
 * El destino es el celular sin el código del banco.
 */

const MONTO = /^Monto\s*B[s5]\.?\s*:?\s*(\S+)/i;

function monto(filas: Fila[]): CampoCrudo | undefined {
  for (const f of filas) {
    const m = MONTO.exec(f.texto.trim());
    if (m) return montoBs(m[1], "etiqueta");
  }
  return undefined;
}

export const caroniPagos: Reconocedor<CamposDeposito> = {
  id: "caroni-pagos",
  detecta(filas) {
    if (!claveComparacion(filas.map((f) => f.texto).join(" ")).includes("caroni")) return false;
    return ["Número de Referencia", "Banco Destino Fondos", "Fecha y Hora de Operación", "Cuenta / Tarjeta Destino / Tlf"].filter(
      (e) => valorDeEtiqueta(filas, e) !== null,
    ).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Caroní", "constante") };
    const ref = digitos(valorDeEtiqueta(filas, "Número de Referencia"));
    const fecha = fechaDma(valorDeEtiqueta(filas, "Fecha y Hora de Operación"));
    const tel = celular(valorDeEtiqueta(filas, "Cuenta / Tarjeta Destino / Tlf"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha ? crudo(fecha, "etiqueta") : undefined,
      referencia: ref ? crudo(ref, "etiqueta") : undefined,
      cuentaDestino: tel ? crudo(tel, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
