import { useEffect, useRef } from "react";

/**
 * Qué hace la pantalla con las imágenes soltadas en cualquier parte de la ventana (`components/SoltarImagenes.tsx`).
 * `destino(n)` es el texto del aviso mientras se arrastran `n` imágenes; `null` = no las acepta (y dice por qué).
 */
export type Receptor = { destino: (n: number) => string; recibir: ((files: File[]) => void) | null };

const pila: Receptor[] = [];

/** Lo registra una pantalla; manda el último registrado. Devuelve cómo quitarlo. */
export function registrarReceptor(r: Receptor): () => void {
  pila.push(r);
  return () => {
    const i = pila.lastIndexOf(r);
    if (i >= 0) pila.splice(i, 1);
  };
}

export const receptorActual = (): Receptor | null => pila[pila.length - 1] ?? null;

/** Mientras el componente está montado, las imágenes soltadas fuera de sus zonas van a `r` (siempre la versión más reciente). */
export function useReceptorArchivos(r: Receptor) {
  const ref = useRef(r);
  ref.current = r;
  useEffect(
    () =>
      registrarReceptor({
        destino: (n) => ref.current.destino(n),
        get recibir() {
          const f = ref.current.recibir;
          return f && ((files: File[]) => f(files));
        },
      }),
    [],
  );
}

/** Archivos que una pantalla le pasa a otra al navegar (un `File` no viaja por la URL). */
let entrega: { ruta: string; files: File[]; hora: number } | null = null;
// Si la navegación no llegó (p. ej. la frenó un aviso de cambios sin guardar), no aparecen más tarde.
const VIGENCIA_MS = 30_000;

export function entregarArchivos(ruta: string, files: File[]): void {
  entrega = { ruta, files, hora: Date.now() };
}

/** Los archivos entregados a `ruta`, una sola vez. */
export function tomarArchivos(ruta: string): File[] {
  const e = entrega;
  entrega = null;
  return e && e.ruta === ruta && Date.now() - e.hora <= VIGENCIA_MS ? e.files : [];
}
