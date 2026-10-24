import type { FilaPlan } from "@/db/operaciones/importarPagos";

/** Por qué una fila pide revisión; vacío = la fila está bien. La tasa faltante ya llega en `problemas`. */
export function motivosFila(f: FilaPlan): string[] {
  const motivos = [...f.problemas];
  if (f.duplicados.length > 0) motivos.push("Ya está registrado");
  if (f.repetidaEnArchivo !== null) motivos.push(`Repetida en el archivo (fila ${f.repetidaEnArchivo})`);
  if (f.repetidaPosibleEnArchivo !== null) motivos.push(`Posible repetido (fila ${f.repetidaPosibleEnArchivo})`);
  else if (f.posiblesRepetidos.length > 0) motivos.push("Posible repetido");
  if (f.bancoDesconocido) motivos.push("Banco desconocido");
  if (f.estadoTasa === "distinta") motivos.push("Tasa distinta a la registrada");
  return motivos;
}
