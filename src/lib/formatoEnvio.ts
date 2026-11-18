import { useState } from "react";
import { nombreLegible } from "@/domain/texto";

/** En qué se envía el estado de cuenta; se recuerda el último elegido (localStorage). */
export const FORMATOS_ENVIO = ["imagen", "pdf", "excel", "pdf-excel"] as const;
export type FormatoEnvio = (typeof FORMATOS_ENVIO)[number];
/** Cada archivo que sale: "PDF y Excel" son dos, que se copian juntos (se pegan de una vez en WhatsApp). */
export type FormatoArchivo = Exclude<FormatoEnvio, "pdf-excel">;

export const ETIQUETA_FORMATO: Record<FormatoEnvio, string> = { imagen: "Imagen", pdf: "PDF", excel: "Excel", "pdf-excel": "PDF y Excel" };
const EXTENSION: Record<FormatoArchivo, string> = { imagen: "png", pdf: "pdf", excel: "xlsx" };

/** Los archivos que lleva un formato de envío. */
export const archivosDeFormato = (formato: FormatoEnvio): FormatoArchivo[] => (formato === "pdf-excel" ? ["pdf", "excel"] : [formato]);

export const normalizarFormato = (v: unknown): FormatoEnvio => (FORMATOS_ENVIO.includes(v as FormatoEnvio) ? (v as FormatoEnvio) : "imagen");

/** "Ana - Julio 2026 - 21-10-2026.pdf" (sin lo que Windows o `copiar_envio` no aceptan). */
export const nombreEstadoCuenta = (formato: FormatoArchivo, gerente: string, campana: string, fecha: string): string =>
  `${nombreLegible([gerente, campana], fecha)}.${EXTENSION[formato]}`;

const clave = "control-pagos:formato-envio";

function leer(): FormatoEnvio {
  try {
    return normalizarFormato(localStorage.getItem(clave));
  } catch {
    return "imagen";
  }
}

export function useFormatoEnvio(): [FormatoEnvio, (f: FormatoEnvio) => void] {
  const [formato, setFormato] = useState(leer);
  return [
    formato,
    (f) => {
      setFormato(f);
      try {
        localStorage.setItem(clave, f);
      } catch {
        // sin almacenamiento solo se pierde la comodidad de recordarlo
      }
    },
  ];
}
