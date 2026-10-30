import { claveComparacion } from "@/domain/texto";
import { contiene, valorDeEtiqueta, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { celular, crudo, digitos, fechaDma, montoBs } from "./comun";

/**
 * Bancaribe, "¡Operación exitosa!" del pago móvil: cada etiqueta con ":" a la izquierda y su valor a la derecha
 * (Fecha "10-10-2026 01:54 PM", Monto "Bs. 28.881,79", Referencia, Celular de origen, Celular de destino, Banco del beneficiario).
 * El OCR pierde la etiqueta "Referencia:" y deja el número solo en su fila, entre el monto y el celular de origen:
 * si está ahí y son solo dígitos, es la referencia. El destino es el celular de destino.
 */

const empieza = (f: Fila, etiqueta: string) => claveComparacion(f.texto).startsWith(claveComparacion(etiqueta));

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const conEtiqueta = digitos(valorDeEtiqueta(filas, "Referencia"));
  if (conEtiqueta) return crudo(conEtiqueta, "etiqueta");
  const monto = filas.findIndex((f) => empieza(f, "Monto"));
  const origen = filas.findIndex((f) => empieza(f, "Celular de origen"));
  if (monto < 0 || origen < 0) return undefined;
  const entre = filas.slice(monto + 1, origen).filter((f) => /^\d{6,}$/.test(f.texto.trim()));
  return entre.length === 1 ? crudo(entre[0].texto.trim(), "etiqueta") : undefined;
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const v = valorDeEtiqueta(filas, "Monto");
  return v ? montoBs(v.replace(/^B[s5]\.?\s*/i, "").trim(), "etiqueta") : undefined;
}

export const bancaribePagomovil: Reconocedor<CamposDeposito> = {
  id: "bancaribe-pagomovil",
  detecta(filas) {
    if (!contiene(filas, "Bancaribe") || valorDeEtiqueta(filas, "Celular de origen") === null) return false;
    return ["Celular de destino", "Monto", "Fecha"].filter((e) => valorDeEtiqueta(filas, e) !== null).length >= 2;
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Bancaribe", "constante") };
    const fecha = fechaDma(valorDeEtiqueta(filas, "Fecha"));
    const destino = celular(valorDeEtiqueta(filas, "Celular de destino"));
    const campos = {
      montoBs: monto(filas),
      fecha: fecha ? crudo(fecha, "etiqueta") : undefined,
      referencia: referencia(filas),
      cuentaDestino: destino ? crudo(destino, "etiqueta") : undefined,
    };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
