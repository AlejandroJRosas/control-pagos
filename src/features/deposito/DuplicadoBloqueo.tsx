import { CopyX, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tecla } from "@/components/AyudaAtajos";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { ComprobanteThumb } from "@/components/ComprobanteThumb";
import type { Duplicado } from "@/db/repos/depositos";
import { formatFecha } from "@/domain/dates";
import { formatBs } from "@/domain/money";
import { useAtajo } from "@/hooks/useAtajo";
import { irA, SELECTOR_DUPLICADO } from "@/lib/irAError";

export type AccionesDuplicado = {
  /** El existente toma los datos del formulario. */
  onActualizar: (d: Duplicado) => void;
  /** Se descarta lo que se está registrando (Ctrl+D). */
  onDescartar: () => void;
  ocupado: boolean;
};

/** Un depósito con el banco y la referencia de otro no se registra: o se actualiza el existente o se descarta este. */
export function DuplicadoBloqueo({ duplicados, acciones }: { duplicados: Duplicado[]; acciones: AccionesDuplicado }) {
  useAtajo("d", acciones.onDescartar, { ctrl: true, activo: !acciones.ocupado });
  return (
    <div role="alert" data-duplicado className="grid gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <CopyX className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">Este depósito ya está registrado</p>
          <p className="text-muted-foreground">No se puede registrar dos veces el mismo banco y referencia. Actualiza el existente con estos datos o descarta este.</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {duplicados.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-2">
            {d.imagenPath ? <ComprobanteThumb path={d.imagenPath} /> : null}
            <div className="mr-auto min-w-0">
              <div className="font-medium tabular-nums">
                {formatFecha(d.fecha)} · {formatBs(d.montoBs)}
              </div>
              <div className="truncate text-muted-foreground">
                {d.gerenteNombre} · {d.campanaNombre}
                {d.campanaEstado === "cerrada" && " (cerrada)"}
              </div>
            </div>
            <BotonConMotivo motivo={d.campanaEstado === "cerrada" ? "Su campaña está cerrada" : undefined}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={acciones.ocupado || d.campanaEstado === "cerrada"}
                title={d.campanaEstado === "cerrada" ? undefined : "Reemplaza sus datos con los de este formulario (sigue con su gerente)"}
                onClick={() => acciones.onActualizar(d)}
              >
                <RefreshCw />
                Actualizar este
              </Button>
            </BotonConMotivo>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="button" variant="destructive" disabled={acciones.ocupado} onClick={acciones.onDescartar}>
          <Trash2 />
          Descartar
          <Tecla className="border-current/30 bg-transparent text-current">Ctrl+D</Tecla>
        </Button>
      </div>
    </div>
  );
}

/** Junto a los botones de guardar, que quedan deshabilitados: dice por qué y lleva al bloque del duplicado. */
export function MotivoDuplicado({ className }: { className?: string }) {
  return (
    <button type="button" className={cn("self-center text-sm text-destructive underline-offset-4 hover:underline", className)} onClick={() => irA(document, SELECTOR_DUPLICADO)}>
      Ya está registrado: ver arriba
    </button>
  );
}
