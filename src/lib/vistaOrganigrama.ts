/**
 * Vista del organigrama (Estructura): `escala` del dibujo y su desplazamiento (x, y) en px dentro del marco. Se
 * recuerda por campaña en localStorage.
 */
export type VistaOrganigrama = { escala: number; x: number; y: number };
type Tam = { w: number; h: number };

export const ESCALA_MIN = 0.2;
export const ESCALA_MAX = 2;

const limitarEscala = (e: number) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, e));

/**
 * Que el dibujo no se pierda: si entra en el marco no sale de él; si es más grande, no deja hueco a los lados (como
 * al desplazar una imagen ampliada).
 */
export function limitarVista(v: VistaOrganigrama, marco: Tam, dibujo: Tam): VistaOrganigrama {
  const escala = limitarEscala(v.escala);
  const lim = (n: number, m: number, d: number) => {
    const sobra = m - d * escala;
    return sobra >= 0 ? Math.min(sobra, Math.max(0, n)) : Math.min(0, Math.max(sobra, n));
  };
  return { escala, x: lim(v.x, marco.w, dibujo.w), y: lim(v.y, marco.h, dibujo.h) };
}

/** Todo el dibujo a la vista (sin agrandarlo más del 100 %), centrado a lo ancho y arriba. */
export function ajustarVista(marco: Tam, dibujo: Tam): VistaOrganigrama {
  if (dibujo.w <= 0 || dibujo.h <= 0) return { escala: 1, x: 0, y: 0 };
  const escala = limitarEscala(Math.min(1, marco.w / dibujo.w, marco.h / dibujo.h));
  return { escala, x: Math.max(0, (marco.w - dibujo.w * escala) / 2), y: 0 };
}

/** Multiplica la escala por `factor` dejando fijo el punto (px, py) del marco (el del cursor o el centro). */
export function zoomVista(v: VistaOrganigrama, factor: number, px: number, py: number): VistaOrganigrama {
  const escala = limitarEscala(v.escala * factor);
  const k = escala / v.escala;
  return { escala, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Lo guardado, si es una vista válida. */
export function normalizarVista(guardado: unknown): VistaOrganigrama | null {
  if (!guardado || typeof guardado !== "object") return null;
  const { escala, x, y } = guardado as Record<string, unknown>;
  const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return num(escala) && num(x) && num(y) && escala > 0 ? { escala: limitarEscala(escala), x, y } : null;
}

const prefijo = "control-pagos:vista-estructura:";

export function leerVista(clave: string): VistaOrganigrama | null {
  try {
    const crudo = localStorage.getItem(prefijo + clave);
    return normalizarVista(crudo ? JSON.parse(crudo) : null);
  } catch {
    return null;
  }
}

export function guardarVista(clave: string, v: VistaOrganigrama | null): void {
  try {
    if (v) localStorage.setItem(prefijo + clave, JSON.stringify(v));
    else localStorage.removeItem(prefijo + clave);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarla
  }
}
