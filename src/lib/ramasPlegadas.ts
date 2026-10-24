import { useState } from "react";

/** Ramas plegadas (ids de asignación) de "Por gerente" en árbol; se recuerdan por campaña en localStorage. */
export const normalizarRamas = (guardado: unknown): number[] =>
  Array.isArray(guardado) ? [...new Set(guardado.filter((n): n is number => Number.isInteger(n) && n > 0))] : [];

const prefijo = "control-pagos:ramas-plegadas:";

function leer(clave: string): number[] {
  try {
    const crudo = localStorage.getItem(prefijo + clave);
    return normalizarRamas(crudo ? JSON.parse(crudo) : null);
  } catch {
    return [];
  }
}

function guardar(clave: string, ids: number[]): void {
  try {
    if (ids.length > 0) localStorage.setItem(prefijo + clave, JSON.stringify(ids));
    else localStorage.removeItem(prefijo + clave);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarlas
  }
}

/** Por defecto todo desplegado. Si cambia `clave` (otra campaña en la misma pantalla) se lee lo suyo. */
export function useRamasPlegadas(clave: string) {
  const [estado, setEstado] = useState(() => ({ clave, ids: leer(clave) }));
  const ids = estado.clave === clave ? estado.ids : leer(clave);
  const cambiar = (f: (ids: number[]) => number[]) =>
    setEstado((e) => {
      const n = f(e.clave === clave ? e.ids : leer(clave));
      guardar(clave, n);
      return { clave, ids: n };
    });
  return {
    plegados: new Set(ids),
    alternar: (id: number) => cambiar((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    plegar: (lista: number[], plegar: boolean) => cambiar((l) => (plegar ? [...new Set([...l, ...lista])] : l.filter((x) => !lista.includes(x)))),
  };
}
