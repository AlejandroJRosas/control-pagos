import { claveDuplicado } from "./bancos";

/** El siguiente pendiente después de `actualId` en el orden de la cola, volviendo al inicio; null si no queda otro. */
export function siguientePendiente(items: { id: number; estado: "pendiente" | "hecho" }[], actualId: number | null): number | null {
  const i = actualId === null ? -1 : items.findIndex((x) => x.id === actualId);
  const rotados = i < 0 ? items : [...items.slice(i + 1), ...items.slice(0, i)];
  return rotados.find((x) => x.estado === "pendiente")?.id ?? null;
}

/** Otros pendientes de la cola con el mismo banco y referencia que `id` (aviso, no bloqueo). */
export function duplicadosEnCola(items: { id: number; estado: string; banco: string; referencia: string }[], id: number): number[] {
  const yo = items.find((x) => x.id === id);
  if (!yo) return [];
  const clave = claveDuplicado(yo.banco, yo.referencia);
  if (!clave) return [];
  return items
    .filter((x) => x.id !== id && x.estado === "pendiente" && claveDuplicado(x.banco, x.referencia) === clave)
    .map((x) => x.id);
}
