import type { Result } from "./validation";

/** Paleta fija (las clases de cada color viven en `components/EtiquetaChip.tsx`, con modo oscuro). */
export const COLORES_ETIQUETA = ["gris", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "rosa"] as const;
export type ColorEtiqueta = (typeof COLORES_ETIQUETA)[number];

export const MAX_NOMBRE_ETIQUETA = 30;

export type EtiquetaDraft = { nombre: string; color: string };
export type EtiquetaValida = { nombre: string; color: ColorEtiqueta };

const esColor = (c: string): c is ColorEtiqueta => (COLORES_ETIQUETA as readonly string[]).includes(c);

export function validateEtiqueta(d: EtiquetaDraft): Result<EtiquetaValida, keyof EtiquetaDraft> {
  const errors: Partial<Record<keyof EtiquetaDraft, string>> = {};
  const nombre = d.nombre.trim();
  if (!nombre) errors.nombre = "Indica el nombre";
  else if (nombre.length > MAX_NOMBRE_ETIQUETA) errors.nombre = `Máximo ${MAX_NOMBRE_ETIQUETA} caracteres`;
  if (!esColor(d.color)) errors.color = "Elige un color";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { nombre, color: d.color as ColorEtiqueta } };
}

/** Filtro `?etiquetas=1,4` → ids (sin repetir, sin basura). */
export function idsDeFiltro(v: string): number[] {
  const ids = v
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

export const filtroDeIds = (ids: number[]): string => [...ids].sort((a, b) => a - b).join(",");

/** Un gerente pasa el filtro si tiene alguna de las etiquetas elegidas (sin elegir ninguna, pasan todos). */
export const conEtiquetas = (delGerente: number[], elegidas: number[]): boolean =>
  elegidas.length === 0 || elegidas.some((id) => delGerente.includes(id));
