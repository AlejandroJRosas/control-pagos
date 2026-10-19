/** Selección múltiple como en el Explorador de Windows; `ancla` es desde donde cuenta el Shift+clic. */
export type Seleccion = { marcados: ReadonlySet<number>; ancla: number | null };
export type Modificadores = { ctrl: boolean; shift: boolean };

export const SIN_SELECCION: Seleccion = { marcados: new Set(), ancla: null };

/**
 * Clic sobre `id`; `orden` son los ids que se pueden marcar, en el orden en que se ven.
 * Clic: solo ese. Ctrl: agrega o quita ese. Shift: el rango desde el ancla (con Ctrl, sumado a lo que había).
 */
export function clicSeleccion(s: Seleccion, orden: readonly number[], id: number, { ctrl, shift }: Modificadores): Seleccion {
  const pos = orden.indexOf(id);
  if (pos < 0) return ctrl || shift ? s : SIN_SELECCION;
  const posAncla = s.ancla === null ? -1 : orden.indexOf(s.ancla);
  if (shift && posAncla >= 0) {
    const rango = orden.slice(Math.min(pos, posAncla), Math.max(pos, posAncla) + 1);
    return { marcados: new Set(ctrl ? [...s.marcados, ...rango] : rango), ancla: s.ancla };
  }
  if (ctrl) {
    const marcados = new Set(s.marcados);
    if (marcados.has(id)) marcados.delete(id);
    else marcados.add(id);
    return { marcados, ancla: id };
  }
  return { marcados: new Set([id]), ancla: id };
}

/** Marca todos los de `orden`; si ya estaban todos, limpia la selección. */
export function seleccionarTodos(s: Seleccion, orden: readonly number[]): Seleccion {
  const todos = orden.length > 0 && orden.every((id) => s.marcados.has(id));
  return todos ? SIN_SELECCION : { marcados: new Set(orden), ancla: s.ancla };
}
