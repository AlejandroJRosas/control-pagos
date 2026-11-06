type Asig = { id: number; gerenteNombre: string; jefeId: number | null };

/** Texto de la confirmación al quitar un gerente (sin depósitos) de la campaña: su gente pasa al jefe de él. */
export function descripcionQuitar(nombre: string, asignacionId: number, asignaciones: Asig[]): string {
  const base = `Se quitará a ${nombre} de esta campaña.`;
  const n = asignaciones.filter((a) => a.jefeId === asignacionId).length;
  if (n === 0) return base;
  const jefeId = asignaciones.find((a) => a.id === asignacionId)?.jefeId ?? null;
  const jefe = jefeId === null ? undefined : asignaciones.find((a) => a.id === jefeId)?.gerenteNombre;
  return `${base} ${n === 1 ? "El 1 que tiene debajo pasa" : `Los ${n} que tiene debajo pasan`} ${jefe ? `a ${jefe}` : "a la punta, sin jefe"}.`;
}
