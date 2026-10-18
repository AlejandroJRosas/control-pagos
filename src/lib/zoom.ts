/** Vista de una imagen con zoom: `escala` relativa a la imagen ajustada al contenedor (1 = ajustada); x, y = desplazamiento en px. */
export type Vista = { escala: number; x: number; y: number };

export const VISTA_AJUSTADA: Vista = { escala: 1, x: 0, y: 0 };

/** Multiplica la escala por `factor` dejando fijo el punto (px, py) del contenedor bajo el cursor. */
export function zoomEnPunto(v: Vista, factor: number, px: number, py: number, maxEscala: number): Vista {
  const escala = Math.min(maxEscala, v.escala * factor);
  if (escala <= 1) return VISTA_AJUSTADA;
  const k = escala / v.escala;
  return { escala, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Evita desplazar la imagen más allá de sus bordes (el contenido mide `cont * escala`). */
export function limitarPan(v: Vista, cont: { w: number; h: number }): Vista {
  const lim = (n: number, tam: number) => Math.min(0, Math.max(tam * (1 - v.escala), n));
  return { escala: v.escala, x: lim(v.x, cont.w), y: lim(v.y, cont.h) };
}

/** Hasta 400 % del tamaño real, pero nunca menos que la vista ajustada. */
export function escalaMaxima(natural: { w: number; h: number }, ajustada: { w: number; h: number }): number {
  return Math.max(1, (4 * natural.w) / ajustada.w);
}
