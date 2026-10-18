import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TasaConUsos } from "@/db/repos/tasas";
import { calendarioTasas, mesSiguiente, type DiaCalendario } from "@/domain/calendarioTasas";
import { formatFecha, todayIso } from "@/domain/dates";
import { formatTasa } from "@/domain/money";
import { cn } from "@/lib/utils";

type Props = {
  tasas: TasaConUsos[];
  onRegistrar: (fecha: string) => void;
  onEditar: (t: TasaConUsos) => void;
};

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-VE", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

/** Mes visto durante la sesión, para no perderlo al ir a otra pantalla y volver. */
let mesRecordado: string | null = null;

export function CalendarioTasas({ tasas, onRegistrar, onEditar }: Props) {
  const hoy = todayIso();
  const [mes, setMesState] = useState(() => mesRecordado ?? hoy.slice(0, 7));
  const setMes = (m: string) => {
    mesRecordado = m;
    setMesState(m);
  };
  const { semanas, faltan } = useMemo(() => calendarioTasas(mes, tasas, hoy), [mes, tasas, hoy]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" aria-label="Mes anterior" onClick={() => setMes(mesSiguiente(mes, -1))}>
          <ChevronLeft />
        </Button>
        <h2 className="w-44 text-center font-medium">{nombreMes(mes)}</h2>
        <Button size="icon-sm" variant="outline" aria-label="Mes siguiente" onClick={() => setMes(mesSiguiente(mes, 1))}>
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" disabled={mes === hoy.slice(0, 7)} onClick={() => setMes(hoy.slice(0, 7))}>
          Hoy
        </Button>
        <span className={cn("ml-2 text-sm", faltan > 0 ? "font-medium text-amber-700" : "text-muted-foreground")}>
          {faltan === 0 ? "Sin días hábiles pendientes" : `${faltan} día(s) hábil(es) sin tasa`}
        </span>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Leyenda className="border-emerald-300 bg-emerald-50" texto="Con tasa" />
          <Leyenda className="border-amber-300 bg-amber-50" texto="Falta la tasa" />
          <Leyenda className="border-slate-200 bg-slate-100" texto="Fin de semana (usa la del viernes)" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS.map((d) => (
          <div key={d} className="px-1 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {semanas.flat().map((d) => (
          <Dia key={d.fecha} d={d} hoy={d.fecha === hoy} onRegistrar={onRegistrar} onEditar={onEditar} />
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

type DiaProps = { d: DiaCalendario<TasaConUsos>; hoy: boolean; onRegistrar: (fecha: string) => void; onEditar: (t: TasaConUsos) => void };

function Dia({ d, hoy, onRegistrar, onEditar }: DiaProps) {
  const base = cn(
    "flex h-20 flex-col rounded-md border p-1.5 text-left text-xs transition-colors",
    !d.delMes && "opacity-40",
    hoy && "ring-2 ring-primary-intenso",
  );
  const numero = <span className="text-sm font-medium">{d.dia}</span>;

  if (d.estado === "tasa" && d.tasa) {
    const t = d.tasa;
    return (
      <button
        type="button"
        className={cn(base, "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950")}
        title={`Editar la tasa del ${formatFecha(d.fecha)}`}
        onClick={() => onEditar(t)}
      >
        {numero}
        <span className="mt-auto text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-200">{formatTasa(t.valor)}</span>
        <span className="text-muted-foreground">{t.usos > 0 ? `${t.usos} depósito(s)` : "sin depósitos"}</span>
      </button>
    );
  }
  if (d.estado === "finde") {
    return (
      <div className={cn(base, "border-slate-200 bg-slate-100 text-muted-foreground dark:bg-slate-900")}>
        {numero}
        {d.tasa ? (
          <>
            <span className="mt-auto tabular-nums">{formatTasa(d.tasa.valor)}</span>
            <span>la del viernes</span>
          </>
        ) : (
          <span className="mt-auto text-amber-700">falta la del viernes</span>
        )}
      </div>
    );
  }
  if (d.estado === "falta") {
    return (
      <button
        type="button"
        className={cn(base, "group border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200")}
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
