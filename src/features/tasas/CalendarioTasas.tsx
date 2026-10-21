import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComprobanteIcono } from "@/components/ComprobanteIcono";
import type { TasaConUsos } from "@/db/repos/tasas";
import type { Feriado } from "@/db/repos/feriados";
import { calendarioTasas, mesSiguiente, type DiaCalendario } from "@/domain/calendarioTasas";
import { formatFecha, nombreDia, todayIso } from "@/domain/dates";
import { formatTasa } from "@/domain/money";
import { cn } from "@/lib/utils";
import { useAtajo } from "@/hooks/useAtajo";

type Props = {
  tasas: TasaConUsos[];
  feriados: Feriado[];
  onRegistrar: (fecha: string) => void;
  onEditar: (t: TasaConUsos) => void;
};

export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-VE", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

/** Mes visto durante la sesión, para no perderlo al ir a otra pantalla y volver. */
let mesRecordado: string | null = null;

export function CalendarioTasas({ tasas, feriados, onRegistrar, onEditar }: Props) {
  const hoy = todayIso();
  const [mes, setMesState] = useState(() => mesRecordado ?? hoy.slice(0, 7));
  const setMes = (m: string) => {
    mesRecordado = m;
    setMesState(m);
  };
  // ← y → cambian de mes (fuera de los campos de texto).
  useAtajo("ArrowLeft", () => setMes(mesSiguiente(mes, -1)));
  useAtajo("ArrowRight", () => setMes(mesSiguiente(mes, 1)));
  const nombres = useMemo(() => new Map(feriados.map((f) => [f.fecha, f.nombre])), [feriados]);
  const { semanas, faltan } = useMemo(() => calendarioTasas(mes, tasas, hoy, new Set(nombres.keys())), [mes, tasas, hoy, nombres]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" aria-label="Mes anterior" title="←" onClick={() => setMes(mesSiguiente(mes, -1))}>
          <ChevronLeft />
        </Button>
        <h2 className="w-44 text-center font-medium">{nombreMes(mes)}</h2>
        <Button size="icon-sm" variant="outline" aria-label="Mes siguiente" title="→" onClick={() => setMes(mesSiguiente(mes, 1))}>
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" disabled={mes === hoy.slice(0, 7)} onClick={() => setMes(hoy.slice(0, 7))}>
          Hoy
        </Button>
        <span className={cn("ml-2 text-sm", faltan > 0 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          {faltan === 0 ? "Sin días hábiles pendientes" : `${faltan} día(s) hábil(es) sin tasa`}
        </span>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Leyenda className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" texto="Con tasa" />
          <Leyenda className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" texto="Falta la tasa" />
          <Leyenda className="border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" texto="Fin de semana o feriado (usa la del siguiente día hábil)" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS.map((d) => (
          <div key={d} className="px-1 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {semanas.flat().map((d) => (
          <Dia key={d.fecha} d={d} hoy={d.fecha === hoy} feriado={nombres.get(d.fecha)} onRegistrar={onRegistrar} onEditar={onEditar} />
        ))}
      </div>
    </div>
  );
}

function Leyenda({ className, texto }: { className: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm border", className)} />
      {texto}
    </span>
  );
}

type DiaProps = {
  d: DiaCalendario<TasaConUsos>;
  hoy: boolean;
  /** Nombre del feriado (null si no tiene; undefined si no es feriado). */
  feriado: string | null | undefined;
  onRegistrar: (fecha: string) => void;
  onEditar: (t: TasaConUsos) => void;
};

function Dia({ d, hoy, feriado, onRegistrar, onEditar }: DiaProps) {
  const base = cn(
    "flex h-20 flex-col rounded-md border p-1.5 text-left text-xs transition-colors",
    !d.delMes && "opacity-40",
    hoy && "ring-2 ring-primary-intenso",
  );
  const numero = <span className="text-sm font-medium">{d.dia}</span>;

  if (d.estado === "tasa" && d.tasa) {
    const t = d.tasa;
    const imagen = t.imagenPath;
    return (
      <div className="relative">
        <button
          type="button"
          className={cn(base, "w-full border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:hover:bg-emerald-900")}
          title={`Editar la tasa del ${formatFecha(d.fecha)}`}
          onClick={() => onEditar(t)}
        >
          {numero}
          <span className="mt-auto text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-200">{formatTasa(t.valor)}</span>
          <span className="text-muted-foreground">{t.usos > 0 ? `${t.usos} depósito(s)` : "sin depósitos"}</span>
        </button>
        {imagen && (
          <span className="absolute top-1 right-1">
            <ComprobanteIcono
              path={imagen}
              label={`Ver la captura de la tasa del ${formatFecha(d.fecha)}`}
              className="size-6 text-emerald-800 hover:bg-emerald-200 hover:text-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-800 dark:hover:text-emerald-100 [&_svg]:size-3.5"
            />
          </span>
        )}
      </div>
    );
  }
  if (d.estado === "finde" || d.estado === "feriado") {
    const etiqueta = d.estado === "feriado" ? "Feriado" : null;
    return (
      <div
        className={cn(base, "border-slate-200 bg-slate-100 text-muted-foreground dark:border-slate-800 dark:bg-slate-900")}
        title={etiqueta ? `Feriado${feriado ? `: ${feriado}` : ""}` : undefined}
      >
        <span className="flex items-baseline gap-1">
          {numero}
          {etiqueta && <span className="truncate font-medium">{feriado ?? etiqueta}</span>}
        </span>
        {d.tasa ? (
          <>
            <span className="mt-auto tabular-nums">{formatTasa(d.tasa.valor)}</span>
            <span>la del {nombreDia(d.tasa.fecha)}</span>
          </>
        ) : (
          <span className="mt-auto text-amber-700 dark:text-amber-400">falta la del día hábil siguiente</span>
        )}
      </div>
    );
  }
  if (d.estado === "falta") {
    return (
      <button
        type="button"
        className={cn(base, "group border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900")}
        title={`Registrar la tasa del ${formatFecha(d.fecha)}`}
        onClick={() => onRegistrar(d.fecha)}
      >
        {numero}
        <span className="mt-auto font-medium">Sin tasa</span>
        <span className="inline-flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
          <Plus className="size-3" />
          Registrar
        </span>
      </button>
    );
  }
  return <div className={cn(base, "text-muted-foreground")}>{numero}</div>;
}
