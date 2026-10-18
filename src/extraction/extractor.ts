import { todayIso } from "@/domain/dates";
import { agruparFilas } from "./filas";
import { reconocedoresDeposito, reconocedoresTasa } from "./formatos";
import { normalizarDeposito, normalizarTasa } from "./normalizar";
import { windowsOcr } from "./ocr/windowsOcr";
import type { OcrEngine } from "./ocr/types";
import type { CampoCrudo, CampoPropuesto, CamposDeposito, CamposTasa, ExtractionResult, Reconocedor } from "./tipos";

export type { CampoPropuesto, CamposDeposito, CamposTasa, ExtractionResult } from "./tipos";

/** Lee un comprobante o una imagen de tasa y propone valores para el formulario. */
export interface Extractor {
  extraerDeposito(imagen: Blob): Promise<ExtractionResult<CamposDeposito>>;
  extraerTasa(imagen: Blob): Promise<ExtractionResult<CamposTasa>>;
}

export const nullExtractor: Extractor = {
  async extraerDeposito() {
    return { formato: null, fields: {} };
  },
  async extraerTasa() {
    return { formato: null, fields: {} };
  },
};

export function crearExtractor(engine: OcrEngine, hoy: () => string = todayIso): Extractor {
  async function extraer<F extends string>(
    imagen: Blob,
    reconocedores: Reconocedor<F>[],
    normalizar: (c: Partial<Record<F, CampoCrudo>>, hoy: string) => Partial<Record<F, CampoPropuesto>>,
  ): Promise<ExtractionResult<F>> {
    const filas = agruparFilas(await engine.reconocer(imagen));
    const r = reconocedores.find((x) => x.detecta(filas));
    return r ? { formato: r.id, fields: normalizar(r.extrae(filas), hoy()) } : { formato: null, fields: {} };
  }
  return {
    extraerDeposito: (imagen) => extraer(imagen, reconocedoresDeposito, normalizarDeposito),
    extraerTasa: (imagen) => extraer(imagen, reconocedoresTasa, normalizarTasa),
  };
}

export const extractor: Extractor = crearExtractor(windowsOcr);
