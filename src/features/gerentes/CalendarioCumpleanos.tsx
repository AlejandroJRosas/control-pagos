import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Cake, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mesSiguiente, semanasDelMes } from "@/domain/calendarioTasas";
import { cumpleanosDelMes, cumpleanosProximos, textoFaltan, type ConNacimiento } from "@/domain/cumpleanos";
import { formatFecha, nombreDia, todayIso } from "@/domain/dates";
import { cn } from "@/lib/utils";
import { DIAS, nombreMes } from "@/features/tasas/CalendarioTasas";
import { useAtajo } from "@/hooks/useAtajo";

/** Días hacia adelante de la lista de próximos cumpleaños. */
const DIAS_PROXIMOS = 30;

/** Mes visto durante la sesión, para no perderlo al ir a otra pantalla y volver. */
let mesRecordado: string | null = null;

/** Calendario mensual con los cumpleaños remarcados y la lista de los próximos. */
export function CalendarioCumpleanos({ gerentes }: { gerentes: ConNacimiento[] }) {
  const hoy = todayIso();
  const [mes, setMesState] = useState(() => mesRecordado ?? hoy.slice(0, 7));
  const setMes = (m: string) => {
    mesRecordado = m;
    setMesState(m);
  };
  // ← y → cambian de mes (fuera de los campos de texto).
  useAtajo("ArrowLeft", () => setMes(mesSiguiente(mes, -1)));
  useAtajo("ArrowRight", () => setMes(mesSiguiente(mes, 1)));
  const porDia = useMemo(() => cumpleanosDelMes(mes, gerentes), [mes, gerentes]);
  const proximos = useMemo(() => cumpleanosProximos(gerentes, hoy, DIAS_PROXIMOS), [gerentes, hoy]);
  const total = [...porDia.values()].reduce((n, l) => n + l.length, 0);
  const sinFecha = gerentes.filter((g) => !g.nacimiento).length;

  return (
    <div className="space-y-6">
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
          <span className="ml-2 text-sm text-muted-foreground">{total === 0 ? "Sin cumpleaños este mes" : `${total} cumpleaños este mes`}</span>
          {sinFecha > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{sinFecha} gerente(s) activo(s) sin fecha de nacimiento</span>
          )}
        </div>
        <div role="group" aria-label={`Cumpleaños de ${nombreMes(mes).toLowerCase()}`} className="grid grid-cols-7 gap-1.5">
          {DIAS.map((d) => (
            <div key={d} className="px-1 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {semanasDelMes(mes)
            .flat()
            .map((d) => {
              const cumples = d.delMes ? (porDia.get(d.fecha) ?? []) : [];
              return (
                <div
                  key={d.fecha}
                  className={cn(
                    "flex min-h-20 flex-col gap-0.5 rounded-md border p-1.5 text-xs",
                    !d.delMes && "opacity-40",
                    d.fecha === hoy && "ring-2 ring-primary-intenso",
                    cumples.length > 0
                      ? "border-pink-300 bg-pink-50 text-pink-900 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-200"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-medium">{d.dia}</span>
                    {cumples.length > 0 && <Cake className="size-3.5" />}
                  </span>
                  {cumples.map((c) => (
                    <Link key={c.id} to={`/gerentes/${c.id}`} className="truncate font-medium underline-offset-2 hover:underline" title={`${c.nombre} cumple ${c.edad} años`}>
                      {c.nombre} ({c.edad})
                    </Link>
                  ))}
                </div>
              );
            })}
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="font-medium">Próximos {DIAS_PROXIMOS} días</h2>
        {proximos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún cumpleaños en los próximos {DIAS_PROXIMOS} días.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {proximos.map((c) => (
              <li key={c.id} className={cn("flex flex-wrap items-center gap-x-3 px-3 py-2", c.dias === 0 && "bg-pink-50 dark:bg-pink-950")}>
                <Link to={`/gerentes/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                  {c.nombre}
                </Link>
                <span className="text-muted-foreground">
                  {nombreDia(c.fecha)} {formatFecha(c.fecha)}
                </span>
                <span>cumple {c.edad} años</span>
                <span className={cn("ml-auto", c.dias <= 3 ? "font-medium text-pink-700 dark:text-pink-300" : "text-muted-foreground")}>
                  {textoFaltan(c.dias)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
