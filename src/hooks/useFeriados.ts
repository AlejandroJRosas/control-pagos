import { feriadosSet } from "@/db/repos/feriados";
import { useData } from "./useData";

const VACIO: ReadonlySet<string> = new Set();

/** Fechas de los feriados registrados (vacío mientras carga). */
export function useFeriados(): ReadonlySet<string> {
  return useData((db) => feriadosSet(db), []).data ?? VACIO;
}
