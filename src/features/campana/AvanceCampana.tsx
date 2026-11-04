import { CircleCheck, Copy, Plus } from "lucide-react";
import { ESTILO_META, describirMeta } from "@/components/estiloMeta";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BotonConMotivo, MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import type { Campana } from "@/db/repos/campanas";
import type { Resumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { diasHasta, vistaMetas, type Meta, type MetaVista } from "@/domain/metas";
import { formatPct, formatUsd } from "@/domain/money";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

/** Separación mínima (en % del ancho) entre dos etiquetas de la misma fila; si no cabe, va a la otra fila. */
const SEPARACION = 14;

/** Reparte las etiquetas en dos filas para que no se pisen (la que no cabe en ninguna va a la de menor choque). */
function filasDeEtiquetas(metas: MetaVista[]): number[] {
  const ultima = [-Infinity, -Infinity];
  return metas.map((m) => {
    const fila = m.posicion - ultima[0] >= SEPARACION ? 0 : m.posicion - ultima[1] >= SEPARACION ? 1 : ultima[0] <= ultima[1] ? 0 : 1;
    ultima[fila] = m.posicion;
    return fila;
  });
}

/** Ancla de la etiqueta: centrada en la marca, salvo en los bordes (para no salirse). */
const anclaje = (pos: number) => (pos < 8 ? "translate-x-0" : pos > 92 ? "-translate-x-full" : "-translate-x-1/2");

type Props = {
  campana: Campana;
  total: Resumen;
  metas: Meta[];
  hoy: string;
  cerrada: boolean;
  onAgregar: () => void;
  onEditar: (m: Meta) => void;
};

/**
 * Avance de la campaña en grande: lo pagado sobre el saldo general, con las metas marcadas en la barra (clic = editar),
 * la próxima meta y lo que falta, y la fecha final de la campaña al 100 %.
 */
export function AvanceCampana({ campana, total, metas, hoy, cerrada, onAgregar, onEditar }: Props) {
  const { metas: vistas, proxima } = vistaMetas(metas, total, hoy);
  const filas = filasDeEtiquetas(vistas);
  const nFilas = vistas.length === 0 ? 0 : Math.max(...filas) + 1;
  const completo = total.pct >= 100;
  const avanceEnBarra = Math.min(Math.max(total.pct, 0), 100);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(formatPct(total.pct));
      toast.success("Avance copiado", { description: formatPct(total.pct) });
    } catch (e) {
      reportError(e, "No se pudo copiar");
    }
  }

  return (
    <section aria-label="Avance de la campaña">
    <Card className="gap-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="grid gap-0.5">
          <span className="text-sm text-muted-foreground">Avance de la campaña</span>
          <div className="flex items-baseline gap-3">
            <button
              type="button"
              onClick={() => void copiar()}
              aria-label={`Copiar Avance: ${formatPct(total.pct)}`}
              title="Clic para copiar"
              className={cn("group flex cursor-copy items-center gap-1.5 rounded text-3xl font-semibold tabular-nums", completo && "text-emerald-700 dark:text-emerald-400")}
            >
              <span>{formatPct(total.pct)}</span>
              <Copy aria-hidden className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatUsd(total.pagado)} de {formatUsd(total.asignado)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProximaMeta proxima={proxima} hayMetas={vistas.length > 0} hoy={hoy} />
          <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
            <Button variant="outline" size="sm" disabled={cerrada} onClick={onAgregar}>
              <Plus />
              Agregar meta
            </Button>
          </BotonConMotivo>
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Inicio <span className="tabular-nums">{formatFecha(campana.fechaInicio)}</span>
          </span>
          <span className="text-right">
            100 % ·{" "}
            {campana.fechaFin ? (
              <>
                fin <span className="font-medium text-foreground tabular-nums">{formatFecha(campana.fechaFin)}</span>
              </>
            ) : (
              "sin fecha final"
            )}
          </span>
        </div>
        {/* Lo pagado hasta hoy, sobre la punta del progreso y con su color. */}
        <div className="relative h-7">
          <span
            data-pagado-actual
            title={`Pagado hasta hoy: ${formatUsd(total.pagado)} (${formatPct(total.pct)})`}
            className={cn("absolute bottom-1 flex flex-col items-center", anclaje(avanceEnBarra))}
            style={{ left: `${avanceEnBarra}%` }}
          >
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap tabular-nums shadow-sm",
                completo ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground",
              )}
            >
              {formatUsd(total.pagado)}
            </span>
          </span>
        </div>
        <div className="relative">
          <span
            aria-hidden
            className={cn("absolute -top-2 -bottom-1 z-10 w-0.5 -translate-x-1/2 rounded-full", completo ? "bg-emerald-600" : "bg-primary-intenso")}
            style={{ left: `${avanceEnBarra}%` }}
          />
          <div className="h-4 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width]", completo ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${avanceEnBarra}%` }}
            />
          </div>
          {vistas.map((m) => (
            <span
              key={m.id}
              aria-hidden
              className={cn("absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full", ESTILO_META[m.estado].linea)}
              style={{ left: `${m.posicion}%` }}
            />
          ))}
        </div>
        {nFilas > 0 && (
          <div className="relative" style={{ height: `${nFilas * 2.6}rem` }}>
            {vistas.map((m, i) => {
              const estilo = ESTILO_META[m.estado];
              const Icono = estilo.icono;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={cerrada}
                  aria-label={describirMeta(m)}
                  title={describirMeta(m)}
                  onClick={() => onEditar(m)}
                  className={cn(
                    "absolute grid justify-items-start rounded-md px-1.5 py-0.5 text-left text-xs leading-tight whitespace-nowrap tabular-nums",
                    "enabled:hover:bg-fila-hover disabled:cursor-default",
                    anclaje(m.posicion),
                    estilo.texto,
                  )}
                  style={{ left: `${m.posicion}%`, top: `${filas[i] * 2.6}rem` }}
                >
                  <span className="flex items-center gap-1 font-medium">
                    <Icono className="size-3.5" />
                    {formatUsd(m.montoUsd)}
                  </span>
                  <span className="text-muted-foreground">{formatFecha(m.fecha)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
    </section>
  );
}

function ProximaMeta({ proxima, hayMetas, hoy }: { proxima: MetaVista | null; hayMetas: boolean; hoy: string }) {
  if (!hayMetas) return <span className="text-sm text-muted-foreground">Sin metas: agrega una para seguir el ritmo de pagos.</span>;
  if (!proxima)
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-4" />
        Todas las metas cumplidas
      </span>
    );
  const dias = diasHasta(hoy, proxima.fecha);
  const nDias = (n: number) => (n === 1 ? "1 día" : `${n} días`);
  const cuando = dias < 0 ? `vencida hace ${nDias(-dias)}` : dias === 0 ? "vence hoy" : `en ${nDias(dias)}`;
  return (
    <span className={cn("text-sm", proxima.estado === "vencida" ? "text-destructive" : "text-muted-foreground")}>
      Próxima meta: <span className="font-medium text-foreground tabular-nums">{formatUsd(proxima.montoUsd)}</span> para el{" "}
      <span className="tabular-nums">{formatFecha(proxima.fecha)}</span> · faltan{" "}
      <span className="font-medium tabular-nums">{formatUsd(proxima.falta)}</span> · {cuando}
    </span>
  );
}
