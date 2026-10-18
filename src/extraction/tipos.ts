import type { Fila } from "./filas";

export type CamposDeposito = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs";
export type CamposTasa = "fecha" | "valor";

/** Texto tal como lo halló un reconocedor, con cómo lo halló (define la confianza). */
export type CampoCrudo = { texto: string; certeza: "etiqueta" | "heuristica" | "constante" };
/** Valor listo para el formulario; confidence en 0..1. */
export type CampoPropuesto = { value: string; confidence: number };
export type ExtractionResult<F extends string> = { formato: string | null; fields: Partial<Record<F, CampoPropuesto>> };

/** Un formato de comprobante: decide si la imagen es suya y saca los campos por etiqueta. */
export interface Reconocedor<F extends string> {
  id: string;
  detecta(filas: Fila[]): boolean;
  extrae(filas: Fila[]): Partial<Record<F, CampoCrudo>>;
}
