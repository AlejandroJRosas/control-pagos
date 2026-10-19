import type { FilaPlan, PlanImportacion } from "@/db/operaciones/importarPagos";

export const marcadasPorDefecto = (filas: FilaPlan[]) => new Set(filas.filter((f) => f.marcada).map((f) => f.fila));

/** Tras volver a revisar: se conserva la elección, se desmarca lo que dejó de ser importable y se sugiere lo que pasó a serlo. */
export function ajustarMarcadas(antes: PlanImportacion, despues: PlanImportacion, marcadas: Set<number>): Set<number> {
  const eraImportable = new Set(antes.filas.filter((f) => f.importable).map((f) => f.fila));
  return new Set(
    despues.filas.filter((f) => f.importable && (marcadas.has(f.fila) || (!eraImportable.has(f.fila) && f.marcada))).map((f) => f.fila),
  );
}
