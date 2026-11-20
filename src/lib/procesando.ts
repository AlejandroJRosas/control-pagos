import { useSyncExternalStore } from "react";

/**
 * Trabajos que tardan después de soltar o elegir un archivo (abrir un .zip, extraer un .cpagos, leer un Excel): mientras
 * corren, `components/Procesando.tsx` muestra un aviso que tapa la app. Pueden solaparse; se muestra el último.
 */
let trabajos: { id: number; texto: string }[] = [];
let siguiente = 0;
const oyentes = new Set<() => void>();

const avisar = () => {
  for (const o of oyentes) o();
};

// Dos cuadros: el aviso alcanza a pintarse antes de que un trabajo pesado y sincrónico (p. ej. `unzipSync`) ocupe el hilo.
const esperarPintado = () =>
  new Promise<void>((listo) => {
    if (typeof requestAnimationFrame !== "function") return void setTimeout(listo, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => listo()));
  });

/** Corre `trabajo` con el aviso `texto` a la vista; lo quita al terminar, salga bien o mal. */
export async function procesando<T>(texto: string, trabajo: () => Promise<T>): Promise<T> {
  const id = ++siguiente;
  trabajos = [...trabajos, { id, texto }];
  avisar();
  try {
    await esperarPintado();
    return await trabajo();
  } finally {
    trabajos = trabajos.filter((t) => t.id !== id);
    avisar();
  }
}

export const textoProcesando = (): string | null => trabajos[trabajos.length - 1]?.texto ?? null;

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

export const useProcesando = (): string | null => useSyncExternalStore(suscribir, textoProcesando);
