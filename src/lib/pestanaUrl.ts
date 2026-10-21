import { useSearchParams } from "react-router";

/**
 * Pestaña de una pantalla en la URL (`?tab=…`; la primera de `pestanas` no se escribe): sobrevive a volver atrás desde
 * un detalle y no pisa los demás parámetros (p. ej. los filtros).
 */
export function usePestanaUrl<T extends string>(pestanas: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const [porDefecto] = pestanas;
  const leida = params.get("tab");
  const pestana = pestanas.find((p) => p === leida) ?? porDefecto;

  function setPestana(v: string) {
    // Las pestañas avisan también al montarse: sin cambio no se navega (pisaría los filtros que se están recuperando).
    if (v === pestana) return;
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
