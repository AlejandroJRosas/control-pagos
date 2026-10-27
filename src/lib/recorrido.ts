/**
 * Lista de depósitos que se recorre con ← / → desde el detalle: los ids en el orden (y con los filtros) de la tabla desde
 * la que se abrió. Viaja en el `state` de la navegación junto con `volver` y queda fija mientras se recorre.
 */
export function conRecorrido<T extends object>(state: T, ids: number[]): T & { recorrido: number[] } {
  return { ...state, recorrido: ids };
}

export function leerRecorrido(state: unknown): number[] | null {
  const r = (state as { recorrido?: unknown } | null | undefined)?.recorrido;
  if (!Array.isArray(r) || !r.every((id) => typeof id === "number")) return null;
  return r;
}

export type Vecinos = { anterior: number | null; siguiente: number | null; posicion: number; total: number };

export function vecinos(ids: number[], id: number): Vecinos | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return { anterior: ids[i - 1] ?? null, siguiente: ids[i + 1] ?? null, posicion: i + 1, total: ids.length };
}
