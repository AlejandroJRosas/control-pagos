import { Tooltip } from "@base-ui/react";
import { TriangleAlert } from "lucide-react";

/** Ícono de aviso con los motivos (uno por línea) al pasar el mouse; nada si no hay motivos. */
export function IconoIncidencias({ motivos }: { motivos: string[] }) {
  if (motivos.length === 0) return null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={0}
        aria-label={`Incidencias: ${motivos.join("; ")}`}
        render={<span className="inline-flex cursor-default text-amber-600 dark:text-amber-400" />}
      >
        <TriangleAlert className="size-4" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md">
            {motivos.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
