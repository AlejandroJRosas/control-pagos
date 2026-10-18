export type ExtractableField = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs";
export type ExtractedField = { value: string; confidence: number };
export type ExtractionResult = { fields: Partial<Record<ExtractableField, ExtractedField>> };

/** Lee un comprobante y propone valores. En la fase 2 se conecta el OCR local aquí. */
export interface Extractor {
  extract(image: Blob): Promise<ExtractionResult>;
}

export const nullExtractor: Extractor = {
  async extract() {
    return { fields: {} };
  },
};

export const extractor: Extractor = nullExtractor;
