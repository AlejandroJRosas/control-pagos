import type { Miga } from "@/components/PageHeader";
import type { EstadoLote } from "@/components/SoltarImagenes";

/**
 * Migas de la subida en lote y de la revisión de una campaña. Si se entró desde un gerente (`EstadoLote.gerente`, que la
 * subida pasa también a la revisión), terminan en él: así Esc vuelve a la pantalla del gerente y no a la campaña.
 */
export function migasLote(campana: { id: number; nombre: string }, asignaciones: { id: number; gerenteNombre: string }[], estado: EstadoLote | null): Miga[] {
  const migas = [
    { to: "/campanas", label: "Campañas" },
    { to: `/campanas/${campana.id}`, label: campana.nombre },
  ];
  const origen = asignaciones.find((a) => `a:${a.id}` === estado?.gerente);
  return origen ? [...migas, { to: `/asignaciones/${origen.id}`, label: origen.gerenteNombre }] : migas;
}

/** Lo que se pasa al ir entre la subida y la revisión: solo el gerente de origen (si lo hay). */
export const estadoLote = (estado: EstadoLote | null): EstadoLote | undefined => (estado?.gerente ? { gerente: estado.gerente } : undefined);
