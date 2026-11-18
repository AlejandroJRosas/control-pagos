import { useEffect, useRef, useState } from "react";
import { CircleCheck, Copy, Plus } from "lucide-react";
import { ESTILO_META, describirMeta, textoMeta } from "@/components/estiloMeta";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BotonConMotivo, MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import type { Campana } from "@/db/repos/campanas";
import type { GerenteResumen, Resumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { contarCumplimiento, diasHasta, vistaMetas, type Meta, type MetaVista } from "@/domain/metas";
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
  /** "Avance de la campaña" o, en la página de un gerente, "Avance de Ana". */
  titulo?: string;
  /** Sin ellos (la página de un gerente) no se agregan ni editan metas: son de la campaña. */
  onAgregar?: () => void;
  onEditar?: (m: Meta) => void;
  /** Para contar quiénes cumplen una meta por porcentaje (solo en la campaña). */
  gerentes?: GerenteResumen[];
  /** Abre Por gerente con esa meta elegida. */
  onVerGerentes?: (metaId: number) => void;
};

/**
 * Avance de la campaña en grande: lo pagado sobre el saldo general, con las metas marcadas en la barra (clic = editar),
 * la próxima meta y lo que falta, y la fecha final de la campaña al 100 %. Sirve igual para un gerente: `total` es su
 * resumen y `metas` las de porcentaje, medidas sobre su saldo.
 */
export function AvanceCampana({ campana, total, metas, hoy, cerrada, titulo = "Avance de la campaña", onAgregar, onEditar, gerentes, onVerGerentes }: Props) {
  const editable = !cerrada && !!onEditar;
  const { metas: vistas, proxima } = vistaMetas(metas, total, hoy);
  const filas = filasDeEtiquetas(vistas);
  const nFilas = vistas.length === 0 ? 0 : Math.max(...filas) + 1;
  const completo = total.pct >= 100;
  const avanceEnBarra = Math.min(Math.max(total.pct, 0), 100);
  // La meta bajo el mouse (o con el foco): se marca su trayecto, las demás se atenúan y sale su casilla.
  const [enfocadaId, setEnfocadaId] = useState<number | null>(null);
  const enfocada = vistas.find((m) => m.id === enfocadaId) ?? null;
  // Al salir se cierra con un respiro: así el mouse llega a la casilla (y a su enlace) sin que se cierre por el camino.
  const cierre = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enfocar = (id: number) => {
    clearTimeout(cierre.current);
    setEnfocadaId(id);
  };
  const soltar = () => {
    clearTimeout(cierre.current);
    cierre.current = setTimeout(() => setEnfocadaId(null), 120);
  };
  useEffect(() => () => clearTimeout(cierre.current), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(formatPct(total.pct));
      toast.success("Avance copiado", { description: formatPct(total.pct) });
    } catch (e) {
      reportError(e, "No se pudo copiar");
    }
  }

  return (
    <section aria-label={titulo}>
    {/* overflow-visible: la casilla de la meta enfocada sale por debajo de la tarjeta. */}
    <Card className="gap-4 overflow-visible px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="grid gap-0.5">
          <span className="text-sm text-muted-foreground">{titulo}</span>
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
          {onAgregar && (
            <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
              <Button variant="outline" size="sm" disabled={cerrada} onClick={onAgregar}>
                <Plus />
                Agregar meta
              </Button>
            </BotonConMotivo>
          )}
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
              className={cn("h-full transition-[width]", completo ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${avanceEnBarra}%` }}
            />
          </div>
          {/* Trayecto de lo pagado hasta la meta enfocada (solo si aún falta). */}
          {enfocada && enfocada.estado !== "cumplida" && enfocada.posicion > avanceEnBarra && (
            <span
              data-trayecto
              aria-hidden
              className={cn(
                "absolute inset-y-0 border-2 border-l-0 border-dashed",
                enfocada.estado === "vencida" ? "border-destructive bg-destructive/20" : "border-primary-intenso bg-primary/30",
              )}
              style={{ left: `${avanceEnBarra}%`, width: `${enfocada.posicion - avanceEnBarra}%` }}
            />
          )}
          {vistas.map((m) => (
            <span
              key={m.id}
              aria-hidden
              className={cn(
                "absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full transition-opacity",
                ESTILO_META[m.estado].linea,
                enfocada && enfocada.id !== m.id && "opacity-25",
              )}
              style={{ left: `${m.posicion}%` }}
            />
          ))}
        </div>
        {nFilas > 0 && (
          <div className="relative" style={{ height: `${nFilas * 2.6}rem` }}>
            {vistas.map((m, i) => {
              const estilo = ESTILO_META[m.estado];
              const Icono = estilo.icono;
              const atenuada = !!enfocada && enfocada.id !== m.id;
              // La casilla va junto al botón (no dentro) para que su enlace se pueda pulsar; el contenedor la mantiene abierta.
              return (
                <div
                  key={m.id}
                  onMouseEnter={() => enfocar(m.id)}
                  onMouseLeave={soltar}
                  onFocus={() => enfocar(m.id)}
                  onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && soltar()}
                  className={cn("absolute", enfocada?.id === m.id && "z-20", anclaje(m.posicion))}
                  style={{ left: `${m.posicion}%`, top: `${filas[i] * 2.6}rem` }}
                >
                  <button
                    type="button"
                    // aria-disabled y no disabled: un botón deshabilitado no recibe el hover y la casilla no saldría.
                    aria-disabled={!editable || undefined}
                    aria-label={describirMeta(m)}
                    data-atenuada={atenuada || undefined}
                    onClick={() => editable && onEditar(m)}
                    className={cn(
                      "grid justify-items-start rounded-md px-1.5 py-0.5 text-left text-xs leading-tight whitespace-nowrap tabular-nums transition-opacity",
                      editable ? "hover:bg-fila-hover" : "cursor-default",
                      atenuada && "opacity-30",
                      estilo.texto,
                    )}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <Icono className="size-3.5" />
                      {textoMeta(m)}
                    </span>
                    <span className="text-muted-foreground">{formatFecha(m.fecha)}</span>
                  </button>
                  {enfocada?.id === m.id && (
                    <CasillaMeta
                      m={m}
                      hoy={hoy}
                      gerentes={gerentes && m.porcentaje !== null ? contarCumplimiento(m, gerentes) : null}
                      onVerGerentes={() => onVerGerentes?.(m.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
    </section>
  );
}

const nDias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/** "en 15 días", "vence hoy" o "vencida hace 2 días". */
function cuandoVence(hoy: string, fecha: string): string {
  const dias = diasHasta(hoy, fecha);
  return dias < 0 ? `vencida hace ${nDias(-dias)}` : dias === 0 ? "vence hoy" : `en ${nDias(dias)}`;
}

/**
 * Casilla de la meta enfocada: solo lo que falta (o "Cumplida"), la fecha objetivo y los días. En una de porcentaje, además,
 * cuántos gerentes la cumplen y el enlace a Por gerente. El borde de arriba es relleno (no margen) para llegar sin cerrarla.
 */
function CasillaMeta({
  m,
  hoy,
  gerentes,
  onVerGerentes,
}: {
  m: MetaVista;
  hoy: string;
  gerentes: { cumplieron: number; noCumplieron: number } | null;
  onVerGerentes: () => void;
}) {
  const cuentan = gerentes ? gerentes.cumplieron + gerentes.noCumplieron : 0;
  return (
    <span
      role="tooltip"
      className={cn(
        "absolute top-full z-30 pt-1 whitespace-nowrap",
        m.posicion < 8 ? "left-0" : m.posicion > 92 ? "right-0" : "left-1/2 -translate-x-1/2",
      )}
    >
    <span className="grid min-w-36 gap-0.5 rounded-md border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md">
      {m.estado === "cumplida" ? (
        <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-3.5" />
          Cumplida
        </span>
      ) : (
        <span className={cn("text-sm font-semibold", m.estado === "vencida" && "text-destructive")}>
          {m.sinSaldo ? "Sin saldo asignado" : `Faltan ${formatUsd(m.falta)}`}
        </span>
      )}
      <span className="text-muted-foreground">
        Para el <span className="font-medium text-foreground">{formatFecha(m.fecha)}</span>
      </span>
      {m.estado !== "cumplida" && <span className={m.estado === "vencida" ? "text-destructive" : "text-muted-foreground"}>{cuandoVence(hoy, m.fecha)}</span>}
      {gerentes && cuentan > 0 && (
        <span className="mt-1 flex items-center justify-between gap-3 border-t pt-1.5">
          <span className="tabular-nums">
            {`${gerentes.cumplieron} de ${cuentan} ${cuentan === 1 ? "gerente la cumple" : "gerentes la cumplen"}`}
          </span>
          <button type="button" onClick={onVerGerentes} className="font-medium text-primary-intenso hover:underline">
            Ver gerentes
          </button>
        </span>
      )}
    </span>
    </span>
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
  const cuando = cuandoVence(hoy, proxima.fecha);
  return (
    <span className={cn("text-sm", proxima.estado === "vencida" ? "text-destructive" : "text-muted-foreground")}>
      Próxima meta: <span className="font-medium text-foreground tabular-nums">{textoMeta(proxima)}</span> para el{" "}
      <span className="tabular-nums">{formatFecha(proxima.fecha)}</span> ·{" "}
      {proxima.sinSaldo ? (
        "sin saldo asignado"
      ) : (
        <>
          faltan <span className="font-medium tabular-nums">{formatUsd(proxima.falta)}</span>
        </>
      )}{" "}
      · {cuando}
    </span>
  );
}
