import { descendientes } from "./arbol";

type AsignacionArbol = { id: number; gerenteNombre: string; jefeId: number | null };
export type Destino = { id: number; gerenteNombre: string; /** Está debajo (en la estructura) de algún gerente de origen. */ equipo: boolean };

/**
 * A quién se pueden pasar depósitos de los gerentes `origenes` (asignaciones de la misma campaña): primero la gente de
 * su estructura, después los demás, cada grupo por nombre. Si vienen de un solo gerente, él no aparece.
 */
export function destinosPara(asignaciones: AsignacionArbol[], origenes: number[]): Destino[] {
  const jefes = new Map(asignaciones.map((a) => [a.id, a.jefeId]));
  const equipo = new Set(origenes.flatMap((o) => descendientes(jefes, o)));
  const fuera = origenes.length === 1 ? origenes[0] : null;
  const porNombre = (a: AsignacionArbol, b: AsignacionArbol) => a.gerenteNombre.localeCompare(b.gerenteNombre, "es", { sensitivity: "base" });
  const candidatos = asignaciones.filter((a) => a.id !== fuera).sort(porNombre);
  return [...candidatos.filter((a) => equipo.has(a.id)), ...candidatos.filter((a) => !equipo.has(a.id))].map((a) => ({
    id: a.id,
    gerenteNombre: a.gerenteNombre,
    equipo: equipo.has(a.id),
  }));
}
