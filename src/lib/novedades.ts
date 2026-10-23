import lista from "virtual:novedades";
import type { Novedad } from "@/domain/novedades";

/** Historial de cambios incluido al compilar (la versión más nueva primero). */
export const NOVEDADES: readonly Novedad[] = lista;

/** Última versión de la que se vieron las novedades en esta computadora. */
export const KEY_NOVEDADES_VISTAS = "control-pagos:novedades-vistas";

export function leerVersionVista(): string | null {
  try {
    return localStorage.getItem(KEY_NOVEDADES_VISTAS);
  } catch {
    return null;
  }
}

export function marcarVersionVista(version: string): void {
  try {
    localStorage.setItem(KEY_NOVEDADES_VISTAS, version);
  } catch {
    // Sin localStorage se vuelven a mostrar en el próximo arranque: no es grave.
  }
}
