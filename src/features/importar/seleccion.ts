import type { FilaPlan, PlanImportacion } from "@/db/operaciones/importarPagos";

export const marcadasPorDefecto = (filas: FilaPlan[]) => new Set(filas.filter((f) => f.marcada).map((f) => f.fila));

/**
 * Tras volver a revisar: se conserva la elección, se desmarca lo que dejó de ser importable o de sugerirse (p. ej. pasó a posible repetido
 * de algo ya importado) y se sugiere lo que pasó a ser importable. Una marcada a mano que ya no se sugería antes sigue marcada.
 */
export function ajustarMarcadas(antes: PlanImportacion, despues: PlanImportacion, marcadas: Set<number>): Set<number> {
  const previa = new Map(antes.filas.map((f) => [f.fila, f]));
  return new Set(
    despues.filas
      .filter((f) => {
        if (!f.importable) return false;
        const a = previa.get(f.fila);
        if (!a?.importable) return marcadas.has(f.fila) || f.marcada;
        return marcadas.has(f.fila) && !(a.marcada && !f.marcada);
      })
      .map((f) => f.fila),
  );
}
