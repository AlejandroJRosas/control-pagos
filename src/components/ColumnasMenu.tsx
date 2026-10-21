import { useState, type DragEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, ChevronUp, Columns3, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoColumnas } from "@/lib/columnas";
import { cn } from "@/lib/utils";

type Props<K extends string> = {
  estado: EstadoColumnas<K>;
  etiquetas: Record<K, string>;
  onAlternar: (k: K) => void;
  onMover: (k: K, delta: -1 | 1) => void;
  /** Arrastrar y soltar: deja `k` antes de `antesDe` (o al final con `null`). */
  onSoltar: (k: K, antesDe: K | null) => void;
  onRestablecer: () => void;
  /** Columnas que no se pueden mostrar ahora (no se ven y no se pueden marcar), con el motivo. */
  bloqueadas?: Partial<Record<K, string>>;
};

// Tipo propio en el dataTransfer: no lleva "Files", así que SoltarImagenes no lo toma por imágenes.
const TIPO_ARRASTRE = "application/x-control-pagos-columna";

/** Botón "Columnas": mostrar u ocultar cada columna y cambiar su orden arrastrándola o con las flechas. */
export function ColumnasMenu<K extends string>({ estado, etiquetas, onAlternar, onMover, onSoltar, onRestablecer, bloqueadas = {} }: Props<K>) {
  const visibles = estado.orden.length - estado.ocultas.length;
  const [arrastrada, setArrastrada] = useState<K | null>(null);
  // Dónde caería: antes de esa columna (null = al final).
  const [destino, setDestino] = useState<{ antesDe: K | null } | null>(null);

  const terminar = () => {
    setArrastrada(null);
    setDestino(null);
  };

  const sobreFila = (e: DragEvent<HTMLLIElement>, i: number) => {
    if (arrastrada === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const abajo = e.clientY > r.top + r.height / 2;
    setDestino({ antesDe: abajo ? (estado.orden[i + 1] ?? null) : estado.orden[i] });
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    if (arrastrada !== null && destino) onSoltar(arrastrada, destino.antesDe);
    terminar();
  };

  return (
    <Popover.Root>
      <Popover.Trigger render={<Button size="sm" variant="outline" />}>
        <Columns3 />
        Columnas
        {estado.ocultas.length > 0 && (
          <span className="text-muted-foreground tabular-nums">
            ({visibles}/{estado.orden.length})
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50" align="end" sideOffset={4}>
          <Popover.Popup className="w-64 rounded-lg bg-popover p-2 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <Popover.Title className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">Columnas visibles y su orden</Popover.Title>
            <ul className="space-y-0.5" onDrop={soltar}>
              {estado.orden.map((k, i) => {
                const oculta = estado.ocultas.includes(k);
                const ultimaVisible = !oculta && visibles <= 1;
                const bloqueada = bloqueadas[k];
                const lineaArriba = destino !== null && destino.antesDe === k && arrastrada !== k && estado.orden[i - 1] !== arrastrada;
                const lineaAbajo = destino !== null && destino.antesDe === null && i === estado.orden.length - 1 && arrastrada !== k;
                return (
                  <li
                    key={k}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(TIPO_ARRASTRE, k);
                      setArrastrada(k);
                    }}
                    onDragOver={(e) => sobreFila(e, i)}
                    onDragEnd={terminar}
                    className={cn(
                      "relative flex cursor-grab items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-fila-hover active:cursor-grabbing",
                      arrastrada === k && "opacity-40",
                      lineaArriba && "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded-full before:bg-primary",
                      lineaAbajo && "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                    )}
                  >
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <label
                      className={cn("flex flex-1 cursor-pointer items-center gap-2 py-1", (oculta || bloqueada) && "text-muted-foreground", bloqueada && "cursor-default")}
                      title={bloqueada}
                    >
                      <input
                        type="checkbox"
                        checked={!oculta && !bloqueada}
                        disabled={ultimaVisible || !!bloqueada}
                        title={bloqueada ?? (ultimaVisible ? "Debe quedar al menos una columna" : undefined)}
                        onChange={() => onAlternar(k)}
                      />
                      {etiquetas[k]}
                    </label>
                    <Button size="icon-xs" variant="ghost" aria-label={`Subir ${etiquetas[k]}`} disabled={i === 0} onClick={() => onMover(k, -1)}>
                      <ChevronUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Bajar ${etiquetas[k]}`}
                      disabled={i === estado.orden.length - 1}
                      onClick={() => onMover(k, 1)}
                    >
                      <ChevronDown />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 border-t pt-1">
              <Button size="sm" variant="ghost" className="w-full" onClick={onRestablecer}>
                Restablecer
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
