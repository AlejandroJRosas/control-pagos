/** Rectángulo en píxeles de la imagen reconocida. */
export type Caja = { x: number; y: number; w: number; h: number };
export type OcrPalabra = { texto: string; caja: Caja };
export type OcrLinea = { texto: string; palabras: OcrPalabra[]; caja: Caja };
export type OcrResultado = { lineas: OcrLinea[]; ancho: number; alto: number };

/** Motor de OCR intercambiable: hoy el de Windows (`windowsOcr.ts`). */
export interface OcrEngine {
  reconocer(imagen: Blob): Promise<OcrResultado>;
}
