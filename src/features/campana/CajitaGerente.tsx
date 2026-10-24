import type { DragEvent, MouseEvent } from "react";
import Decimal from "decimal.js";
import { ChevronDown } from "lucide-react";
import { ESTADOS_GERENTE } from "@/components/EstadoGerenteBadge";
import { estadoGerente, type GerenteResumen } from "@/domain/campanaView";
import { formatUsd } from "@/domain/money";
import { cn } from "@/lib/utils";

export const TIPO_ARRASTRE = "application/x-asignacion";

/** Lo que la cajita necesita para arrastrarse y recibir a otro (sin esto, en la campaña cerrada, solo se mira). */
export type Arrastre = {
  zona: { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };
  resaltado: boolean;
  origen: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
};

type Props = {
  g: GerenteResumen;
  cerrada: boolean;
  /** Cuántos tiene debajo (todos los niveles); se muestra con la rama plegada. */
  debajo: number;
  /** undefined = sin gente a cargo (no se pliega). */
  plegada?: boolean;
  onAlternar?: () => void;
  /** Clic en la cajita; el evento trae Ctrl/Shift para elegir varias. */
  onClic: (e: MouseEvent) => void;
  /** Elegida junto con otras para moverlas a la vez. */
  elegida?: boolean;
  arrastre?: Arrastre;
};

/** Un gerente en el organigrama: nombre, estado y lo que le falta. */
export function CajitaGerente({ g, cerrada, debajo, plegada, onAlternar, onClic, elegida, arrastre }: Props) {
  const restante = new Decimal(g.restante);
  const estado = ESTADOS_GERENTE[estadoGerente(g)];
  return (
    <div
      {...arrastre?.zona}
      className={cn(
        "relative w-40 rounded-lg border bg-card shadow-xs transition",
        arrastre?.resaltado && "border-primary-intenso ring-2 ring-primary-intenso/40",
        elegida && "border-primary-intenso bg-fila-hover ring-2 ring-primary-intenso/40",
        arrastre?.origen && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-label={g.gerenteNombre}
        title={`${g.gerenteNombre} · ${estado.label}`}
        data-elegida={elegida || undefined}
        draggable={!cerrada}
        onDragStart={arrastre?.onDragStart}
        onDragEnd={arrastre?.onDragEnd}
        onClick={onClic}
        className={cn("grid w-full gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-fila-hover", !cerrada && "cursor-grab active:cursor-grabbing")}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", estado.punto)} />
          <span className="truncate">{g.gerenteNombre}</span>
        </span>
        <span className={cn("text-xs tabular-nums", restante.isNegative() ? "font-medium text-destructive" : "text-muted-foreground")}>
          {restante.isZero() ? "al día" : `Restante ${formatUsd(g.restante)}`}
        </span>
      </button>
      {plegada !== undefined && (
        <button
          type="button"
          aria-label={`${plegada ? "Desplegar" : "Plegar"} a ${g.gerenteNombre}`}
          title={plegada ? `Mostrar a los ${debajo} de su rama` : "Ocultar su rama"}
          onClick={onAlternar}
          className={cn(
            "absolute -bottom-2.5 left-1/2 z-10 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center gap-0.5 rounded-full border bg-background px-1",
            "text-[10px] text-muted-foreground tabular-nums hover:bg-fila-hover hover:text-foreground",
          )}
        >
          {plegada && <span>{debajo}</span>}
          <ChevronDown className={cn("size-3 transition-transform", plegada && "-rotate-90")} />
        </button>
      )}
    </div>
  );
}
