/**
 * Pantalla a la que vuelve un detalle (p. ej. el depósito) cuando se abrió desde otra lista.
 * Viaja en el `state` de la navegación; sin él, cada pantalla usa su destino por defecto.
 */
export type Volver = { to: string; label: string };

export function conVolver(desde: { pathname: string; search: string }, label: string): { volver: Volver } {
  return { volver: { to: desde.pathname + desde.search, label } };
}

export function leerVolver(state: unknown): Volver | null {
  const v = (state as { volver?: unknown } | null | undefined)?.volver as Partial<Volver> | undefined;
  if (!v || typeof v.to !== "string" || typeof v.label !== "string" || !v.to.startsWith("/")) return null;
  return { to: v.to, label: v.label };
}
