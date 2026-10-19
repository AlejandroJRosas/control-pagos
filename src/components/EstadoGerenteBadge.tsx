import { Badge } from "@/components/ui/badge";
import type { EstadoGerente } from "@/domain/campanaView";
import { cn } from "@/lib/utils";

/** Mismos colores por significado que las tarjetas de resumen: restante ámbar, pagado verde, de más rojo. */
export const ESTADOS_GERENTE: Record<EstadoGerente, { label: string; badge: string; punto: string }> = {
  "sin-pagos": { label: "Sin pagos", badge: "bg-muted text-muted-foreground", punto: "bg-muted-foreground/60" },
  "en-curso": { label: "En curso", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", punto: "bg-amber-500" },
  completo: { label: "Completo", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", punto: "bg-emerald-500" },
  excedido: { label: "Pagado de más", badge: "bg-destructive/10 text-destructive", punto: "bg-destructive" },
};

export const ORDEN_ESTADOS: EstadoGerente[] = ["en-curso", "sin-pagos", "completo", "excedido"];

export function EstadoGerenteBadge({ estado, className }: { estado: EstadoGerente; className?: string }) {
  const e = ESTADOS_GERENTE[estado];
  return (
    <Badge className={cn(e.badge, className)}>
      <span className={cn("size-1.5 rounded-full", e.punto)} />
      {e.label}
    </Badge>
  );
}
