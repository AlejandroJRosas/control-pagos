import { useEffect } from "react";
import { useSearchParams } from "react-router";

const PREFIJO = "control-pagos:filtros:";

function leerGuardado(clave: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PREFIJO + clave) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function guardar(clave: string, valores: Record<string, string>): void {
  try {
    const llenos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== ""));
    if (Object.keys(llenos).length === 0) localStorage.removeItem(PREFIJO + clave);
    else localStorage.setItem(PREFIJO + clave, JSON.stringify(llenos));
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarlos
  }
}

/**
 * Filtros de una pantalla guardados en la URL (`?q=…&banco=…`) y recordados por `clave` entre sesiones:
 * si se entra sin ninguno en la URL, se recuperan los últimos usados.
 */
export function useFiltrosUrl<K extends string>(clave: string, keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const valores = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ""])) as Record<K, string>;
  const vacia = keys.every((k) => !params.get(k));

  useEffect(() => {
    if (!vacia) return;
    const g = leerGuardado(clave);
    const recuperar = keys.filter((k) => g[k]);
    if (recuperar.length === 0) return;
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const k of recuperar) n.set(k, g[k]);
        return n;
      },
      { replace: true },
    );
    // Solo al entrar a la pantalla (o al cambiar de clave).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  function set(cambios: Partial<Record<K, string>>) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(cambios) as [K, string][]) {
          if (v) n.set(k, v);
          else n.delete(k);
        }
        guardar(clave, Object.fromEntries(keys.map((k) => [k, n.get(k) ?? ""])));
        return n;
      },
      { replace: true },
    );
  }

  const limpiar = () => set(Object.fromEntries(keys.map((k) => [k, ""])) as Record<K, string>);

  return { valores, set, limpiar, activos: !vacia };
}
