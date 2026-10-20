import { Popover } from "@base-ui/react/popover";
import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoColumnas } from "@/lib/columnas";
import { cn } from "@/lib/utils";

type Props<K extends string> = {
  estado: EstadoColumnas<K>;
  etiquetas: Record<K, string>;
  onAlternar: (k: K) => void;
  onMover: (k: K, delta: -1 | 1) => void;
  onRestablecer: () => void;
  /** Columnas que no se pueden mostrar ahora (no se ven y no se pueden marcar), con el motivo. */
  bloqueadas?: Partial<Record<K, string>>;
};

/** Botón "Columnas": mostrar u ocultar cada columna y cambiar su orden con las flechas. */
export function ColumnasMenu<K extends string>({ estado, etiquetas, onAlternar, onMover, onRestablecer, bloqueadas = {} }: Props<K>) {
  const visibles = estado.orden.length - estado.ocultas.length;
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
            <ul className="space-y-0.5">
              {estado.orden.map((k, i) => {
                const oculta = estado.ocultas.includes(k);
                const ultimaVisible = !oculta && visibles <= 1;
                const bloqueada = bloqueadas[k];
                return (
                  <li key={k} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-fila-hover">
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
