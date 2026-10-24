import { Tooltip } from "@base-ui/react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";

/**
 * Ícono de aviso con los motivos (uno por línea) al pasar el mouse; nada si no hay motivos. `tono`: "aviso" (ámbar, por defecto) o
 * "bloqueo" (rojo: lo que tiene no deja seguir, p. ej. una fila que no se importa).
 */
export function IconoIncidencias({ motivos, tono = "aviso" }: { motivos: string[]; tono?: "aviso" | "bloqueo" }) {
  if (motivos.length === 0) return null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={0}
        aria-label={`Incidencias: ${motivos.join("; ")}`}
        render={<span className={cn("inline-flex cursor-default", tono === "bloqueo" ? "text-destructive" : "text-amber-600 dark:text-amber-400")} />}
      >
        <TriangleAlert className="size-4" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md">
            {motivos.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
