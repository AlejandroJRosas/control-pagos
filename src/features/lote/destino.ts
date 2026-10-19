import type { CampanaData } from "@/db/queries/campanaData";
import type { Gerente } from "@/db/repos/gerentes";
import type { DestinoDraft } from "@/domain/validation";

/** Nombre del gerente elegido en un borrador, para la lista. */
export function nombreDestino(d: DestinoDraft, data: CampanaData, gerentes: Gerente[]): string {
  const m = /^(a|g):(\d+)$/.exec(d.sel);
  if (m?.[1] === "a") return data.asignaciones.find((a) => a.id === Number(m[2]))?.gerenteNombre ?? "sin gerente";
  if (m?.[1] === "g") return gerentes.find((g) => g.id === Number(m[2]))?.nombre ?? "sin gerente";
  if (d.sel === "nuevo") return d.nombre.trim() || "nuevo gerente";
  return "sin gerente";
}
