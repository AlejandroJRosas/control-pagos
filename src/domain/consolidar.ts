import type { AsignacionPaquete } from "./paquete";
import { claveComparacion } from "./texto";

// ---------- Emparejamiento ----------

export type EstadoEmparejamiento = "recordado" | "nombre" | "ninguno" | "varios" | "elegido";

/** Campaña local que corresponde a la del paquete: la recordada, o la de igual nombre si es una sola. */
export function emparejarCampana(
  remota: { uuid: string; nombre: string },
  locales: { id: number; nombre: string }[],
  recordada: number | undefined,
): { campanaId: number | null; estado: EstadoEmparejamiento } {
  if (recordada !== undefined && locales.some((l) => l.id === recordada)) return { campanaId: recordada, estado: "recordado" };
  const clave = claveComparacion(remota.nombre);
  const iguales = locales.filter((l) => claveComparacion(l.nombre) === clave);
  if (iguales.length === 1) return { campanaId: iguales[0].id, estado: "nombre" };
  return { campanaId: null, estado: iguales.length === 0 ? "ninguno" : "varios" };
}

export type AsignacionLocal = {
  id: number; uuid: string; gerenteId: number; gerenteNombre: string; saldoUsd: string; ultimoEnvio: string | null; ultimoRecibo: string | null;
};
/** `asignacionId`: undefined = falta decidir; null = no incluir (sin bloquear). */
export type GerenteEmparejado = { asignacionId: number | null | undefined; estado: EstadoEmparejamiento };

/** Asignación local de cada asignación del paquete (por uuid remoto). Una asignación local recibe a lo sumo una remota automática. */
export function emparejarGerentes(
  remotas: AsignacionPaquete[],
  locales: AsignacionLocal[],
  recordados: Map<string, number>,
): Record<string, GerenteEmparejado> {
  const resultado: Record<string, GerenteEmparejado> = {};
  const usadas = new Set<number>();
  for (const r of remotas) {
    let elegido: GerenteEmparejado;
    const gerenteId = recordados.get(r.gerente.uuid);
    const recordada = gerenteId === undefined ? undefined : locales.find((l) => l.gerenteId === gerenteId);
    if (recordada) {
      elegido = { asignacionId: recordada.id, estado: "recordado" };
    } else {
      const clave = claveComparacion(r.gerente.nombre);
      const iguales = locales.filter((l) => claveComparacion(l.gerenteNombre) === clave);
      if (iguales.length === 0) elegido = { asignacionId: null, estado: "ninguno" };
      else if (iguales.length === 1) elegido = { asignacionId: iguales[0].id, estado: "nombre" };
      else elegido = { asignacionId: undefined, estado: "varios" };
    }
    if (typeof elegido.asignacionId === "number") {
      if (usadas.has(elegido.asignacionId)) elegido = { asignacionId: undefined, estado: "varios" };
      else usadas.add(elegido.asignacionId);
    }
    resultado[r.uuid] = elegido;
  }
  return resultado;
}
