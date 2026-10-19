/** Resultado de la última copia del respaldo a la carpeta espejo (Google Drive). */
export type ResultadoEspejo = { ok: boolean; fecha: string; mensaje: string | null };

export type AvisoEspejo = { tipo: "error" | "sinCopia"; mensaje: string };

/** Pasados estos días sin una copia exitosa se avisa aunque no haya fallado ninguna. */
export const DIAS_ALERTA_ESPEJO = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

export function avisoEspejo(carpeta: string | null, ultimo: ResultadoEspejo | null, ultimoOk: string | null, ahora: string): AvisoEspejo | null {
  if (!carpeta) return null;
  if (ultimo && !ultimo.ok) return { tipo: "error", mensaje: `No se pudo copiar el respaldo a Google Drive: ${ultimo.mensaje ?? "error desconocido"}` };
  if (!ultimoOk || Date.parse(ahora) - Date.parse(ultimoOk) > DIAS_ALERTA_ESPEJO * DIA_MS) {
    return { tipo: "sinCopia", mensaje: `Hace más de ${DIAS_ALERTA_ESPEJO} días que no se copia un respaldo a Google Drive` };
  }
  return null;
}
