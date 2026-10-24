import { useState } from "react";
import { useSearchParams } from "react-router";

const PREFIJO = "control-pagos:pestana:";

function leerGuardada(clave: string | undefined): string | null {
  if (!clave) return null;
  try {
    return localStorage.getItem(PREFIJO + clave);
  } catch {
    return null;
  }
}

function guardar(clave: string | undefined, v: string): void {
  if (!clave) return;
  try {
    localStorage.setItem(PREFIJO + clave, v);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarla
  }
}

/**
 * Pestaña de una pantalla en la URL (`?tab=…`; la primera de `pestanas` no se escribe): sobrevive a volver atrás desde
 * un detalle y no pisa los demás parámetros (p. ej. los filtros). Con `clave`, la última elegida se recuerda en
 * localStorage y es la que se abre al entrar sin `?tab=`.
 */
export function usePestanaUrl<T extends string>(pestanas: readonly T[], clave?: string) {
  const [params, setParams] = useSearchParams();
  const [porDefecto] = pestanas;
  const [guardada, setGuardada] = useState(() => leerGuardada(clave));
  const valida = (v: string | null) => pestanas.find((p) => p === v);
  const leida = params.get("tab");
  const pestana = valida(leida) ?? valida(guardada) ?? porDefecto;

  function setPestana(v: string) {
    // Las pestañas avisan también al montarse: sin cambio no se navega (pisaría los filtros que se están recuperando).
    if (v === pestana) return;
    if (valida(v)) {
      guardar(clave, v);
      setGuardada(v);
    }
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === porDefecto || !pestanas.includes(v as T)) n.delete("tab");
        else n.set("tab", v);
        return n;
      },
      { replace: true },
    );
  }

  return [pestana, setPestana] as const;
}
