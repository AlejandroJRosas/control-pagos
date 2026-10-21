import { useState } from "react";
import { archivoBase } from "@/export/fileName";

/** En qué se envía el estado de cuenta; se recuerda el último elegido (localStorage). */
export const FORMATOS_ENVIO = ["imagen", "pdf", "excel"] as const;
export type FormatoEnvio = (typeof FORMATOS_ENVIO)[number];

export const ETIQUETA_FORMATO: Record<FormatoEnvio, string> = { imagen: "Imagen", pdf: "PDF", excel: "Excel" };
const EXTENSION: Record<FormatoEnvio, string> = { imagen: "png", pdf: "pdf", excel: "xlsx" };

export const normalizarFormato = (v: unknown): FormatoEnvio => (FORMATOS_ENVIO.includes(v as FormatoEnvio) ? (v as FormatoEnvio) : "imagen");

/** Solo letras, números y guiones: el comando `copiar_envio` no acepta otra cosa. */
export const nombreEstadoCuenta = (formato: FormatoEnvio, gerente: string, campana: string, fecha: string): string =>
  `estado-de-cuenta-${archivoBase(gerente)}-${archivoBase(campana)}-${fecha}.${EXTENSION[formato]}`;

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
